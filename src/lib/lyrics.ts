import type { Line, Word } from "./types";

const newId = () => Math.random().toString(36).slice(2, 10);

/** Whisper sometimes loops on a word; drop runs longer than `max`. */
function dropRepeats(words: Word[], max = 4): Word[] {
  const out: Word[] = [];
  let run = 0;
  for (const w of words) {
    const prev = out[out.length - 1];
    run = prev && prev.text.toLowerCase() === w.text.toLowerCase() ? run + 1 : 0;
    if (run < max) out.push(w);
  }
  return out;
}

/** Groups words into singable lines, breaking on pauses, punctuation and length. */
export function wordsToLines(raw: Word[]): Line[] {
  const words = dropRepeats(raw);
  const lines: Line[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length) lines.push({ id: newId(), words: current });
    current = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const chars = current.reduce((n, x) => n + x.text.length + 1, 0);
    // Whisper capitalises the start of a new phrase.
    const newPhrase = /^[A-ZÁÉÍÓÚÑ¿¡]/.test(w.text) && current.length >= 3;
    if (prev && (w.start - prev.end > 0.7 || chars + w.text.length > 42 || newPhrase)) flush();
    current.push(w);
    if (/[.!?¡¿;]$/.test(w.text) && current.length > 2) flush();
  });
  flush();
  return lines;
}

export const lineText = (line: Line) => line.words.map((w) => w.text).join(" ");

export const lineStart = (line: Line) => line.words[0]?.start ?? 0;
export const lineEnd = (line: Line) => line.words[line.words.length - 1]?.end ?? 0;

/**
 * Applies edited text to a line. If the word count is the same we keep each
 * word's timing; otherwise the line's time span is spread across the new
 * words proportionally to their length.
 */
export function setLineText(line: Line, text: string): Line {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === line.words.length) {
    return { ...line, words: line.words.map((w, i) => ({ ...w, text: tokens[i] })) };
  }
  return { ...line, words: spread(tokens, lineStart(line), lineEnd(line)) };
}

function spread(tokens: string[], start: number, end: number): Word[] {
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = start;
  return tokens.map((text, i) => {
    const dur = ((end - start) * weights[i]) / total;
    const w = { text, start: t, end: t + dur };
    t += dur;
    return w;
  });
}

export function shiftLine(line: Line, delta: number): Line {
  return {
    ...line,
    words: line.words.map((w) => ({ ...w, start: Math.max(0, w.start + delta), end: Math.max(0, w.end + delta) })),
  };
}

/** Moves only the start or end of a line, rescaling its words. */
export function setLineBounds(line: Line, start: number, end: number): Line {
  const s0 = lineStart(line);
  const span = lineEnd(line) - s0 || 1;
  const scale = (end - start) / span;
  return {
    ...line,
    words: line.words.map((w) => ({
      ...w,
      start: start + (w.start - s0) * scale,
      end: start + (w.end - s0) * scale,
    })),
  };
}

export function newLine(text: string, start: number, end: number): Line {
  return { id: newId(), words: spread(text.split(/\s+/).filter(Boolean), start, end) };
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
};

/** Enhanced LRC with per-word timestamps, readable by most karaoke players. */
export function toLrc(lines: Line[], title: string): string {
  const body = lines.map(
    (l) => `[${fmt(lineStart(l))}]` + l.words.map((w) => `<${fmt(w.start)}>${w.text} `).join("").trimEnd(),
  );
  return [`[ti:${title}]`, "[re:Kraoke]", ...body].join("\n");
}

export const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
