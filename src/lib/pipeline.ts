import { decodeFile, findVocalRegions, toMono, WHISPER_RATE } from "./audio";
import { getFile, getStem, putStem, updateSong } from "./db";
import { formatTime, wordsToLines } from "./lyrics";
import type { SongMeta, StereoPCM, WhisperQuality, Word } from "./types";
import type { SeparateMessage, SeparateRequest } from "@/workers/separate.worker";
import type { TranscribeMessage, TranscribeRequest } from "@/workers/transcribe.worker";

export type Stage = "decode" | "download-separator" | "separate" | "download-whisper" | "language" | "transcribe";

export type PipelineProgress = {
  stage: Stage;
  /** 0..1 within the stage. */
  progress: number;
  detail?: string;
};

type Report = (p: PipelineProgress) => void;

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

function separate(pcm: StereoPCM, report: Report) {
  return new Promise<{ vocals: StereoPCM; instrumental: StereoPCM }>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/separate.worker.ts", import.meta.url), { type: "module" });
    let backend = "";
    const segments = Math.max(1, Math.ceil((pcm.left.length - 343980) / Math.floor(343980 * 0.9)) + 1);
    worker.onmessage = (e: MessageEvent<SeparateMessage>) => {
      const msg = e.data;
      if (msg.type === "log") console.log("[kraoke]", msg.message);
      else if (msg.type === "download")
        report({
          stage: "download-separator",
          progress: msg.loaded / msg.total,
          detail: `${mb(msg.loaded)} / ${mb(msg.total)}`,
        });
      else if (msg.type === "backend") {
        backend = msg.backend === "webgpu" ? "GPU (WebGPU)" : "CPU (WASM)";
        report({ stage: "separate", progress: 0, detail: backend });
      } else if (msg.type === "progress") {
        const remaining = Math.round(((1 - msg.progress) * msg.secondsPerSegment) / (1 / segments));
        report({ stage: "separate", progress: msg.progress, detail: `${backend} · faltan ~${formatTime(remaining)}` });
      }
      else if (msg.type === "done") {
        worker.terminate();
        resolve({
          vocals: { sampleRate: pcm.sampleRate, ...msg.vocals },
          instrumental: { sampleRate: pcm.sampleRate, ...msg.instrumental },
        });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Falló el separador de audio"));
    };
    // Copies, so the caller's PCM stays usable.
    const req: SeparateRequest = {
      left: new Float32Array(pcm.left),
      right: new Float32Array(pcm.right),
      // Lets us force a backend from the console when comparing speeds.
      backend: (localStorage.getItem("kraoke:backend") as SeparateRequest["backend"]) ?? undefined,
    };
    worker.postMessage(req, [req.left.buffer, req.right.buffer]);
  });
}

function transcribe(req: TranscribeRequest, report: Report) {
  return new Promise<{ words: Word[]; language: string }>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/transcribe.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<TranscribeMessage>) => {
      const msg = e.data;
      if (msg.type === "download")
        report({
          stage: "download-whisper",
          progress: msg.total ? msg.loaded / msg.total : 0,
          detail: `${mb(msg.loaded)} / ${mb(msg.total)}`,
        });
      else if (msg.type === "language") report({ stage: "transcribe", progress: 0, detail: `Idioma: ${msg.language}` });
      else if (msg.type === "progress") report({ stage: "transcribe", progress: msg.progress });
      else if (msg.type === "done") {
        worker.terminate();
        resolve({ words: msg.words, language: msg.language });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Falló la transcripción"));
    };
    report({ stage: "language", progress: 0 });
    worker.postMessage(req, [req.audio.buffer]);
  });
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Splits the song into vocals and instrumental and stores both stems. */
export async function separateSong(song: SongMeta, report: Report): Promise<SongMeta> {
  try {
    report({ stage: "decode", progress: 0 });
    const file = await getFile(song.id);
    if (!file) throw new Error("No se encontró el archivo original");
    const pcm = await decodeFile(file);
    song = await updateSong(song.id, {
      status: "separating",
      error: undefined,
      duration: pcm.left.length / pcm.sampleRate,
    });
    const started = performance.now();
    const stems = await separate(pcm, report);
    await putStem(song.id, "vocals", stems.vocals);
    await putStem(song.id, "instrumental", stems.instrumental);
    return await updateSong(song.id, { status: "separated", separationSeconds: (performance.now() - started) / 1000 });
  } catch (err) {
    return updateSong(song.id, { status: "error", error: errorMessage(err) });
  }
}

/** Transcribes the vocal stem into timed lyrics. Only runs when the user asks for a karaoke. */
export async function transcribeSong(
  song: SongMeta,
  { quality, language }: { quality: WhisperQuality; language: string | null },
  report: Report,
): Promise<SongMeta> {
  try {
    const vocals = await getStem(song.id, "vocals");
    if (!vocals) throw new Error("Primero hay que separar la voz");
    song = await updateSong(song.id, { lyricsStatus: "transcribing", lyricsError: undefined, quality });
    const started = performance.now();
    const mono = await toMono(vocals);
    const regions = findVocalRegions(mono, WHISPER_RATE);
    const { words, language: detected } = await transcribe({ audio: mono, regions, quality, language }, report);
    return await updateSong(song.id, {
      lyricsStatus: "ready",
      language: detected,
      lines: wordsToLines(words),
      transcriptionSeconds: (performance.now() - started) / 1000,
    });
  } catch (err) {
    return updateSong(song.id, { lyricsStatus: "error", lyricsError: errorMessage(err) });
  }
}
