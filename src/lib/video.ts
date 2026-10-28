import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";
import { toAudioBuffer } from "./audio";
import { drawKaraokeFrame } from "./render";
import type { Line, StereoPCM } from "./types";

export type VideoOptions = {
  width: number;
  height: number;
  fps: number;
};

/**
 * Renders the karaoke video frame by frame with WebCodecs. This runs faster
 * than real time and doesn't depend on the tab staying visible, unlike
 * recording the screen with MediaRecorder.
 */
export async function renderKaraokeVideo(
  lines: Line[],
  audio: StereoPCM,
  title: string,
  { width, height, fps }: VideoOptions,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
  const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: audio.sampleRate });
  if (!videoCodec || !audioCodec) throw new Error("Este navegador no puede codificar video. Probá con Chrome o Edge.");

  const canvas = new OffscreenCanvas(width, height);
  // A CPU-backed canvas: turning a GPU canvas into video frames costs ~130 ms
  // per frame on integrated GPUs, against ~30 ms from CPU memory.
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as unknown as CanvasRenderingContext2D;

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH, keyFrameInterval: 2 });
  const sound = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(sound);
  await output.start();

  await sound.add(toAudioBuffer(audio));
  sound.close();

  const duration = audio.left.length / audio.sampleRate;
  const frames = Math.ceil(duration * fps);
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) {
      await output.cancel();
      throw new DOMException("Cancelado", "AbortError");
    }
    const t = i / fps;
    drawKaraokeFrame(ctx, width, height, lines, t, { title });
    await video.add(t, 1 / fps);
    if (i % fps === 0) onProgress(i / frames);
  }
  video.close();
  await output.finalize();
  onProgress(1);

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("No se generó el video");
  return new Blob([buffer], { type: "video/mp4" });
}
