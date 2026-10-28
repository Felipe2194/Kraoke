export type Word = {
  text: string;
  start: number;
  end: number;
};

export type Line = {
  id: string;
  words: Word[];
};

export type SongStatus =
  | "pending"
  | "separating"
  | "transcribing"
  | "ready"
  | "error";

export type WhisperQuality = "fast" | "accurate";

/** Metadata stored in IndexedDB. Audio lives in separate records. */
export type SongMeta = {
  id: string;
  title: string;
  fileName: string;
  createdAt: number;
  duration: number;
  status: SongStatus;
  error?: string;
  language?: string;
  quality: WhisperQuality;
  lines: Line[];
};

/** Stereo PCM at a known sample rate. */
export type StereoPCM = {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
};

export type StemKind = "original" | "vocals" | "instrumental";
