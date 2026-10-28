import { lineEnd, lineStart, lineText } from "./lyrics";
import type { Line } from "./types";

/** How early a line appears before it is sung. */
const LEAD = 1.2;
/** Gaps longer than this show an instrumental break with a countdown. */
const BREAK = 5;

const COLORS = {
  bgTop: "#1a0b2e",
  bgBottom: "#05030a",
  base: "rgba(255,255,255,0.92)",
  sung: "#ff4fa3",
  glow: "rgba(255,79,163,0.35)",
  next: "rgba(255,255,255,0.45)",
  outline: "rgba(0,0,0,0.65)",
};

function activeIndex(lines: Line[], t: number) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lineStart(lines[i]) - LEAD <= t) idx = i;
    else break;
  }
  return idx;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number) {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    size = Math.floor((size * maxWidth) / width);
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
  return size;
}

function drawSungLine(ctx: CanvasRenderingContext2D, line: Line, t: number, cx: number, y: number, maxWidth: number, size: number) {
  const text = lineText(line);
  fitFont(ctx, text, size, maxWidth);
  const total = ctx.measureText(text).width;
  const space = ctx.measureText(" ").width;
  let x = cx - total / 2;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.12);

  for (const word of line.words) {
    const w = ctx.measureText(word.text).width;
    const p = word.end > word.start ? (t - word.start) / (word.end - word.start) : t >= word.start ? 1 : 0;
    const progress = Math.min(1, Math.max(0, p));

    ctx.strokeStyle = COLORS.outline;
    ctx.strokeText(word.text, x, y);
    ctx.fillStyle = COLORS.base;
    ctx.fillText(word.text, x, y);
    if (progress > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 2, y - size, w * progress + 2, size * 2);
      ctx.clip();
      // A wide translucent stroke reads as a glow; shadowBlur is far too
      // slow when rendering thousands of video frames.
      ctx.strokeStyle = COLORS.glow;
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(word.text, x, y);
      ctx.lineWidth = Math.max(4, size * 0.12);
      ctx.strokeStyle = COLORS.outline;
      ctx.strokeText(word.text, x, y);
      ctx.fillStyle = COLORS.sung;
      ctx.fillText(word.text, x, y);
      ctx.restore();
    }
    x += w + space;
  }
}

function drawPlainLine(ctx: CanvasRenderingContext2D, line: Line, cx: number, y: number, maxWidth: number, size: number) {
  const text = lineText(line);
  fitFont(ctx, text, size, maxWidth);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.next;
  ctx.fillText(text, cx, y);
}

function drawCountdown(ctx: CanvasRenderingContext2D, remaining: number, cx: number, y: number, size: number) {
  const dots = Math.min(3, Math.ceil(remaining));
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx + (i - 1) * size * 0.9, y, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = i < dots ? COLORS.sung : "rgba(255,255,255,0.15)";
    ctx.fill();
  }
}

export type RenderOptions = { title: string; subtitle?: string };

/** Draws one karaoke frame at time `t`. Shared by the web room and the video export. */
export function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: Line[],
  t: number,
  { title, subtitle }: RenderOptions,
) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const big = Math.round(height * 0.085);
  const small = Math.round(height * 0.055);
  const maxWidth = width * 0.9;
  const idx = activeIndex(lines, t);
  const first = lines[0];

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (idx < 0) {
    // Intro: title card until the first line comes in.
    fitFont(ctx, title, Math.round(height * 0.09), maxWidth);
    ctx.fillStyle = COLORS.base;
    ctx.fillText(title, cx, height * 0.4);
    if (subtitle) {
      ctx.font = `500 ${small * 0.7}px system-ui, sans-serif`;
      ctx.fillStyle = COLORS.next;
      ctx.fillText(subtitle, cx, height * 0.5);
    }
    if (first) {
      const remaining = lineStart(first) - t;
      if (remaining < 3.5) drawCountdown(ctx, remaining, cx, height * 0.62, small);
      drawPlainLine(ctx, first, cx, height * 0.75, maxWidth, small);
    }
    return;
  }

  const line = lines[idx];
  const next = lines[idx + 1];
  const gapToNext = next ? lineStart(next) - lineEnd(line) : Infinity;
  const inBreak = t > lineEnd(line) + 1 && gapToNext > BREAK && (!next || t < lineStart(next) - LEAD);

  if (inBreak) {
    ctx.font = `700 ${big}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.next;
    ctx.fillText(next ? "♪ ♪ ♪" : "♪ Fin ♪", cx, height * 0.45);
    if (next) {
      const remaining = lineStart(next) - t;
      if (remaining < 3.5 + LEAD) drawCountdown(ctx, remaining - LEAD, cx, height * 0.58, small);
      drawPlainLine(ctx, next, cx, height * 0.7, maxWidth, small);
    }
  } else {
    drawSungLine(ctx, line, t, cx, height * 0.45, maxWidth, big);
    if (next) drawPlainLine(ctx, next, cx, height * 0.62, maxWidth, small);
  }

  ctx.font = `600 ${Math.round(height * 0.028)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText(title, height * 0.04, height * 0.06);
}
