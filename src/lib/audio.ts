import type { StereoPCM } from "./types";

export const SEPARATION_RATE = 44100;
export const WHISPER_RATE = 16000;

export async function decodeFile(file: Blob, sampleRate = SEPARATION_RATE): Promise<StereoPCM> {
  const ctx = new AudioContext({ sampleRate });
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const left = new Float32Array(buffer.getChannelData(0));
    const right =
      buffer.numberOfChannels > 1 ? new Float32Array(buffer.getChannelData(1)) : new Float32Array(left);
    return { sampleRate: buffer.sampleRate, left, right };
  } finally {
    void ctx.close();
  }
}

export function toAudioBuffer(pcm: StereoPCM): AudioBuffer {
  const buffer = new AudioBuffer({
    length: pcm.left.length,
    numberOfChannels: 2,
    sampleRate: pcm.sampleRate,
  });
  buffer.copyToChannel(new Float32Array(pcm.left), 0);
  buffer.copyToChannel(new Float32Array(pcm.right), 1);
  return buffer;
}

/** Downmix to mono and resample, as Whisper expects 16 kHz mono. */
export async function toMono(pcm: StereoPCM, sampleRate = WHISPER_RATE): Promise<Float32Array> {
  const length = Math.ceil((pcm.left.length * sampleRate) / pcm.sampleRate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = toAudioBuffer(pcm);
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

export function encodeWav(pcm: StereoPCM): Blob {
  const n = pcm.left.length;
  const buffer = new ArrayBuffer(44 + n * 4);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 4, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 4, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of [pcm.left, pcm.right]) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Finds stretches of the vocal track with singing, so Whisper only sees
 * audio that contains a voice. Feeding it instrumental passages makes it
 * hallucinate lyrics. Returns [start, end] pairs in seconds, each at most
 * `maxLen` long.
 */
export function findVocalRegions(
  mono: Float32Array,
  sampleRate: number,
  { maxLen = 28, minSilence = 1.2, pad = 0.4 } = {},
): [number, number][] {
  const frame = Math.round(sampleRate * 0.05);
  const energies: number[] = [];
  for (let i = 0; i + frame <= mono.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += mono[j] * mono[j];
    energies.push(Math.sqrt(sum / frame));
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const threshold = Math.max(0.01, loud * 0.08);

  const frameDur = frame / sampleRate;
  const active: [number, number][] = [];
  let start = -1;
  let lastActive = -1;
  energies.forEach((e, i) => {
    if (e > threshold) {
      if (start < 0) start = i;
      lastActive = i;
    } else if (start >= 0 && (i - lastActive) * frameDur > minSilence) {
      active.push([start * frameDur, (lastActive + 1) * frameDur]);
      start = -1;
    }
  });
  if (start >= 0) active.push([start * frameDur, (lastActive + 1) * frameDur]);

  const total = mono.length / sampleRate;
  const regions: [number, number][] = [];
  for (const [s, e] of active) {
    if (e - s < 0.3) continue;
    let a = Math.max(0, s - pad);
    const b = Math.min(total, e + pad);
    // Merge with the previous region when the result still fits a chunk.
    const prev = regions[regions.length - 1];
    if (prev && b - prev[0] <= maxLen && a - prev[1] < minSilence * 2) {
      prev[1] = b;
      continue;
    }
    while (b - a > maxLen) {
      regions.push([a, a + maxLen]);
      a += maxLen;
    }
    regions.push([a, b]);
  }
  return regions;
}
