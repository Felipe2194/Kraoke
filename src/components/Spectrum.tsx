"use client";

import { useEffect, useRef } from "react";

const BANDS = 56;
const MIN_HZ = 40;
const MAX_HZ = 16000;
/** Peaks stay put for this long before falling. */
const PEAK_HOLD = 0.45;
/** How fast peaks fall, in fractions of the full height per second. */
const PEAK_FALL = 0.9;

type Props = { analyser: AnalyserNode | null; className?: string };

/**
 * Bar spectrum on a logarithmic frequency scale, with peak markers that hold
 * the highest recent level for each band and then fall slowly.
 */
export default function Spectrum({ analyser, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d")!;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const nyquist = analyser.context.sampleRate / 2;

    // Bin range of each band, spaced logarithmically like hearing.
    const ranges = Array.from({ length: BANDS }, (_, i) => {
      const lo = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BANDS);
      const hi = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / BANDS);
      const a = Math.floor((lo / nyquist) * bins.length);
      const b = Math.max(a + 1, Math.ceil((hi / nyquist) * bins.length));
      return [a, b] as const;
    });
    const levels = new Float32Array(BANDS);
    const peaks = new Float32Array(BANDS);
    const peakAge = new Float32Array(BANDS);

    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      analyser.getByteFrequencyData(bins);

      ctx.clearRect(0, 0, w, h);
      const gap = Math.max(1, Math.round(w / BANDS / 5));
      const barW = w / BANDS - gap;
      const floor = h * 0.85; // leave room for the reflection
      const gradient = ctx.createLinearGradient(0, floor, 0, 0);
      gradient.addColorStop(0, "#6d28d9");
      gradient.addColorStop(0.6, "#ff4fa3");
      gradient.addColorStop(1, "#ffd1e8");

      for (let i = 0; i < BANDS; i++) {
        const [a, b] = ranges[i];
        let max = 0;
        for (let j = a; j < b && j < bins.length; j++) max = Math.max(max, bins[j]);
        levels[i] = max / 255;

        if (levels[i] >= peaks[i]) {
          peaks[i] = levels[i];
          peakAge[i] = 0;
        } else {
          peakAge[i] += dt;
          if (peakAge[i] > PEAK_HOLD) peaks[i] = Math.max(levels[i], peaks[i] - PEAK_FALL * dt);
        }

        const x = i * (barW + gap) + gap / 2;
        const barH = levels[i] * floor;
        ctx.fillStyle = gradient;
        ctx.fillRect(x, floor - barH, barW, barH);

        ctx.globalAlpha = 0.18;
        ctx.fillRect(x, floor + 2 * dpr, barW, barH * 0.18);
        ctx.globalAlpha = 1;

        if (peaks[i] > 0.01) {
          const capH = Math.max(2, 2 * dpr);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, floor - peaks[i] * floor - capH - dpr, barW, capH);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
