/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/webgpu";
import { CONSTANTS, prepareModelInput, standaloneIspec, standaloneMask } from "demucs-web";
import { fetchCached } from "@/lib/model-cache";

export type SeparateRequest = { left: Float32Array; right: Float32Array; backend?: "webgpu" | "wasm" };

export type SeparateMessage =
  | { type: "download"; loaded: number; total: number }
  | { type: "backend"; backend: string }
  | { type: "progress"; progress: number; secondsPerSegment: number }
  | {
      type: "done";
      vocals: { left: Float32Array; right: Float32Array };
      instrumental: { left: Float32Array; right: Float32Array };
    }
  | { type: "log"; message: string }
  | { type: "error"; message: string };

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

const SEGMENT = 343980; // samples per model run (~7.8 s at 44.1 kHz)
const BINS = 2048;
const FRAMES = 336;
const OVERLAP = 0.1;
const DEBUG = false;

/**
 * htdemucs exported for WebGPU and cut into 21 pieces, so every piece runs on
 * the GPU instead of falling back to the CPU for unsupported ops.
 * https://huggingface.co/monteslu/htdemucs-web-onnx
 */
const SPLIT_BASE = "https://huggingface.co/monteslu/htdemucs-web-onnx/resolve/main/";
// The input normalisation in piece 0 produces NaN in fp16 on WebGPU.
const CPU_NODES = [
  "/ReduceMean", "/Sub", "/Pow", "/ReduceMean_1", "/Clip", "/Sqrt", "/Add", "/Div",
  "/ReduceMean_2", "/Sub_1", "/Pow_1", "/ReduceMean_3", "/Clip_1", "/Sqrt_1", "/Add_1", "/Div_1",
];

type Infer = (mix: Float32Array, mag: Float32Array) => Promise<{ freq: Float32Array; time: Float32Array }>;

const post = (msg: SeparateMessage, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

/**
 * Picks WebGPU only when it is likely to beat the CPU. On Intel integrated
 * GPUs (Iris Xe) we measured ~42 s per segment on WebGPU vs ~30 s on 4 WASM
 * threads, so those use the CPU.
 */
async function pickBackend(): Promise<"webgpu" | "wasm"> {
  try {
    type Adapter = { info?: { vendor?: string } };
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu;
    const adapter = gpu && (await gpu.requestAdapter());
    if (!adapter) return "wasm";
    return adapter.info?.vendor === "intel" ? "wasm" : "webgpu";
  } catch {
    return "wasm";
  }
}

/** Downloads several files reporting combined progress. */
async function fetchAll(urls: string[], sizes: number[]) {
  const totals = [...sizes];
  const loaded = new Array(urls.length).fill(0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const report = () => post({ type: "download", loaded: sum(loaded), total: sum(totals) });
  return Promise.all(
    urls.map((url, i) =>
      fetchCached(url, (l, t) => {
        loaded[i] = l;
        totals[i] = t;
        report();
      }).then((buf) => {
        loaded[i] = totals[i] = buf.byteLength;
        report();
        return buf;
      }),
    ),
  );
}

async function loadSplitModel(): Promise<Infer> {
  const manifest: { pieces: { file: string; inputs: string[]; outputs: string[] }[]; outputs: { freq: string; time: string } } =
    await (await fetch(SPLIT_BASE + "htdemucs_split_manifest.json")).json();
  // Approximate sizes so the progress bar is meaningful before headers arrive.
  const buffers = await fetchAll(
    manifest.pieces.map((p) => SPLIT_BASE + p.file),
    manifest.pieces.map(() => 126e6 / manifest.pieces.length),
  );
  const sessions: ort.InferenceSession[] = [];
  for (let i = 0; i < buffers.length; i++) {
    sessions.push(
      await ort.InferenceSession.create(buffers[i], {
        executionProviders: i === 0 ? [{ name: "webgpu", forceCpuNodeNames: CPU_NODES } as ort.InferenceSession.ExecutionProviderConfig] : ["webgpu"],
        graphOptimizationLevel: "all",
        preferredOutputLocation: "gpu-buffer",
      }),
    );
  }
  const { freq: freqName, time: timeName } = manifest.outputs;

  return async (mix, mag) => {
    const tensors: Record<string, ort.Tensor> = {
      mix: new ort.Tensor("float32", mix, [1, 2, SEGMENT]),
      mag: new ort.Tensor("float32", mag, [1, 4, BINS, FRAMES]),
    };
    const timings: number[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const feeds: Record<string, ort.Tensor> = {};
      for (const name of manifest.pieces[i].inputs) feeds[name] = tensors[name];
      const t = performance.now();
      Object.assign(tensors, await sessions[i].run(feeds));
      timings.push(Math.round(performance.now() - t));
    }
    if (DEBUG) post({ type: "log", message: `piece ms ${timings.join(",")}` });
    const freq = (await tensors[freqName].getData()) as Float32Array;
    const time = (await tensors[timeName].getData()) as Float32Array;
    for (const [name, t] of Object.entries(tensors)) if (name !== "mix" && name !== "mag") t.dispose();
    return { freq, time };
  };
}

async function loadWasmModel(): Promise<Infer> {
  const model = await fetchCached(CONSTANTS.DEFAULT_MODEL_URL, (loaded, total) => post({ type: "download", loaded, total }));
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "basic",
  });
  return async (mix, mag) => {
    const out = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", mix, [1, 2, SEGMENT]),
      [session.inputNames[1]]: new ort.Tensor("float32", mag, [1, 4, BINS, FRAMES]),
    });
    let freq: Float32Array | null = null;
    let time: Float32Array | null = null;
    for (const name of session.outputNames) {
      const t = out[name];
      if (t.dims.length === 5) freq = t.data as Float32Array;
      else if (t.dims.length === 4) time = t.data as Float32Array;
    }
    if (!freq || !time) throw new Error("Salida inesperada del modelo");
    return { freq, time };
  };
}

/**
 * Overlap-add over fixed-size segments, combining the model's spectrogram
 * and waveform branches the way demucs does. Returns vocals and the sum of
 * the other three stems.
 */
async function separate(left: Float32Array, right: Float32Array, infer: Infer) {
  const n = left.length;
  const stride = Math.floor(SEGMENT * (1 - OVERLAP));
  const segments = Math.max(1, Math.ceil((n - SEGMENT) / stride) + 1);
  const voc = { left: new Float32Array(n), right: new Float32Array(n) };
  const inst = { left: new Float32Array(n), right: new Float32Array(n) };
  const weights = new Float32Array(n);

  let idx = 0;
  const t0 = performance.now();
  for (let start = 0; start < n; start += stride) {
    const len = Math.min(SEGMENT, n - start);
    const input = prepareModelInput(left.subarray(start, start + len), right.subarray(start, start + len));
    const { freq, time } = await infer(input.waveform, input.magSpec);
    const specs = standaloneMask(freq);

    const fade = stride * 0.5;
    for (let track = 0; track < 4; track++) {
      const f = standaloneIspec(specs[track], SEGMENT);
      const base = track * 2 * SEGMENT;
      const target = track === 3 ? voc : inst; // tracks: drums, bass, other, vocals
      for (let i = 0; i < len; i++) {
        const w = Math.min(1, i / fade, (len - i) / fade);
        target.left[start + i] += (time[base + i] + f.left[i]) * w;
        target.right[start + i] += (time[base + SEGMENT + i] + f.right[i]) * w;
        if (track === 0) weights[start + i] += w;
      }
    }
    idx++;
    post({ type: "progress", progress: idx / segments, secondsPerSegment: (performance.now() - t0) / 1000 / idx });
    if (start + SEGMENT >= n) break;
  }

  for (let i = 0; i < n; i++) {
    const w = weights[i] || 1;
    voc.left[i] /= w;
    voc.right[i] /= w;
    inst.left[i] /= w;
    inst.right[i] /= w;
  }
  return { voc, inst };
}

self.onmessage = async (e: MessageEvent<SeparateRequest>) => {
  try {
    const { left, right } = e.data;
    const backend = e.data.backend ?? (await pickBackend());
    let infer: Infer;
    if (backend === "webgpu") {
      try {
        const t = performance.now();
        infer = await loadSplitModel();
        post({ type: "log", message: `split model ready in ${Math.round(performance.now() - t)} ms` });
        post({ type: "backend", backend: "webgpu" });
      } catch (err) {
        console.warn("WebGPU no disponible, usando WASM", err);
        infer = await loadWasmModel();
        post({ type: "backend", backend: "wasm" });
      }
    } else {
      infer = await loadWasmModel();
      post({ type: "backend", backend: "wasm" });
    }

    const { voc, inst } = await separate(left, right, infer);
    post({ type: "done", vocals: voc, instrumental: inst }, [voc.left.buffer, voc.right.buffer, inst.left.buffer, inst.right.buffer]);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
