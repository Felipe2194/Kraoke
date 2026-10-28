/// <reference lib="webworker" />
import {
  env,
  pipeline,
  Tensor,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import type { WhisperQuality, Word } from "@/lib/types";

export type TranscribeRequest = {
  /** 16 kHz mono vocal track. */
  audio: Float32Array;
  regions: [number, number][];
  quality: WhisperQuality;
  /** ISO code, or null to autodetect. */
  language: string | null;
};

export type TranscribeMessage =
  | { type: "download"; loaded: number; total: number }
  | { type: "language"; language: string }
  | { type: "progress"; progress: number }
  | { type: "done"; words: Word[]; language: string }
  | { type: "error"; message: string };

const MODELS: Record<WhisperQuality, string> = {
  fast: "onnx-community/whisper-base_timestamped",
  accurate: "onnx-community/whisper-small_timestamped",
};

const RATE = 16000;

env.allowLocalModels = false;

const post = (msg: TranscribeMessage) => self.postMessage(msg);

let loaded: { quality: WhisperQuality; pipe: AutomaticSpeechRecognitionPipeline } | null = null;

async function getPipeline(quality: WhisperQuality) {
  if (loaded?.quality === quality) return loaded.pipe;
  const pipe = (await pipeline("automatic-speech-recognition", MODELS[quality], {
    device: "wasm",
    dtype: "q8",
    progress_callback: (p: ProgressInfo) => {
      if (p.status === "progress_total") post({ type: "download", loaded: p.loaded, total: p.total });
    },
  })) as AutomaticSpeechRecognitionPipeline;
  loaded = { quality, pipe };
  return pipe;
}

/**
 * Transformers.js doesn't detect the language for Whisper (it falls back to
 * English), so we run a single decoder step after <|startoftranscript|> and
 * pick the most likely language token, like the reference implementation.
 */
async function detectLanguage(pipe: AutomaticSpeechRecognitionPipeline, audio: Float32Array) {
  const config = pipe.model.generation_config as unknown as {
    lang_to_id: Record<string, number>;
    decoder_start_token_id: number;
  };
  const { input_features } = await pipe.processor(audio);
  const decoder_input_ids = new Tensor("int64", BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
  const { logits } = (await pipe.model({ input_features, decoder_input_ids })) as { logits: Tensor };
  const scores = logits.data as Float32Array;
  const vocab = logits.dims[2];
  const offset = (logits.dims[1] - 1) * vocab;
  let best = "es";
  let bestScore = -Infinity;
  for (const [token, id] of Object.entries(config.lang_to_id)) {
    const score = scores[offset + id];
    if (score > bestScore) {
      bestScore = score;
      best = token.slice(2, -2);
    }
  }
  return best;
}

self.onmessage = async (e: MessageEvent<TranscribeRequest>) => {
  try {
    const { audio, regions, quality } = e.data;
    const pipe = await getPipeline(quality);
    const slice = ([a, b]: [number, number]) =>
      audio.subarray(Math.floor(a * RATE), Math.min(audio.length, Math.ceil(b * RATE)));

    let language = e.data.language;
    if (!language) {
      // Use the longest stretch of singing for a confident guess.
      const longest = [...regions].sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
      language = longest ? await detectLanguage(pipe, slice(longest)) : "es";
      post({ type: "language", language });
    }

    const words: Word[] = [];
    const total = regions.reduce((sum, [a, b]) => sum + (b - a), 0);
    let done = 0;
    for (const region of regions) {
      const output = await pipe(slice(region), {
        return_timestamps: "word",
        language,
        task: "transcribe",
      });
      const chunks = (Array.isArray(output) ? output[0] : output).chunks ?? [];
      for (const chunk of chunks) {
        const text = chunk.text.trim();
        if (!text) continue;
        const [s, en] = chunk.timestamp;
        const start = region[0] + s;
        const end = region[0] + (en ?? s + 0.3);
        words.push({ text, start, end: Math.min(end, region[1]) });
      }
      done += region[1] - region[0];
      post({ type: "progress", progress: done / total });
    }
    post({ type: "done", words, language });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
