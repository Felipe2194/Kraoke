export type Word = {
  text: string;
  start: number;
  end: number;
};

export type Line = {
  id: string;
  words: Word[];
};

/** Audio separation state. Lyrics are generated separately, on request. */
export type SongStatus = "pending" | "separating" | "separated" | "error";

export type LyricsStatus = "none" | "transcribing" | "ready" | "error";

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
  lyricsStatus: LyricsStatus;
  lyricsError?: string;
  language?: string;
  quality?: WhisperQuality;
  /** How long each step took, shown so users know what to expect next time. */
  separationSeconds?: number;
  transcriptionSeconds?: number;
  lines: Line[];
};

/** Stereo PCM at a known sample rate. */
export type StereoPCM = {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
};

export type StemKind = "original" | "vocals" | "instrumental";
