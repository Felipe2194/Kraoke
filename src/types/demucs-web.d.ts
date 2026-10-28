declare module "demucs-web" {
  type Stem = { left: Float32Array; right: Float32Array };
  type TrackSpec = { leftReal: Float32Array; leftImag: Float32Array; rightReal: Float32Array; rightImag: Float32Array };
  export const CONSTANTS: { DEFAULT_MODEL_URL: string; SAMPLE_RATE: number };
  export function prepareModelInput(
    left: Float32Array,
    right: Float32Array,
  ): { waveform: Float32Array; magSpec: Float32Array; originalLength: number };
  export function standaloneMask(freqOutput: Float32Array): TrackSpec[];
  export function standaloneIspec(spec: TrackSpec, targetLength: number): Stem;
}
