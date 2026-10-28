"use client";

import { useEffect, useRef } from "react";
import { drawKaraokeFrame } from "@/lib/render";
import type { Line } from "@/lib/types";

type Props = {
  lines: Line[];
  title: string;
  getTime: () => number;
  className?: string;
};

/** Canvas that redraws the karaoke frame every animation frame, sized to its container. */
export default function KaraokeCanvas({ lines, title, getTime, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef(lines);
  const getTimeRef = useRef(getTime);

  useEffect(() => {
    linesRef.current = lines;
    getTimeRef.current = getTime;
  }, [lines, getTime]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      drawKaraokeFrame(ctx, w, h, linesRef.current, getTimeRef.current(), { title });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [title]);

  return <canvas ref={canvasRef} className={className} />;
}
