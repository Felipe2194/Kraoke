"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/lyrics";
import { useStemPlayer } from "@/lib/player";
import Spectrum from "./Spectrum";

type Mode = "vocals" | "music" | "both";

const MODES: { mode: Mode; label: string }[] = [
  { mode: "vocals", label: "🎙️ Solo voz" },
  { mode: "music", label: "🎸 Solo música" },
  { mode: "both", label: "🎧 Ambas" },
];

/**
 * Listen to the separated stems. The stems are only read from storage once
 * the user presses play, so the page stays light for people who just want
 * to download.
 */
export default function StemPreview({ songId }: { songId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      {open ? (
        <PreviewPlayer songId={songId} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">🎧 Escuchar la separación</p>
            <p className="text-sm text-white/60">Compará la voz y la música antes de descargarlas.</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-full bg-accent px-5 py-2 font-bold text-black hover:brightness-110"
          >
            ▶ Escuchar
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewPlayer({ songId }: { songId: string }) {
  const player = useStemPlayer(songId, { vocal: 1, music: 0 });
  const { ready, play, currentTime, setVocalVolume, setMusicVolume } = player;
  const [mode, setMode] = useState<Mode>("vocals");
  const [time, setTime] = useState(0);
  const autoplayed = useRef(false);

  // Start as soon as the stems are loaded, since the user already pressed play.
  useEffect(() => {
    if (ready && !autoplayed.current) {
      autoplayed.current = true;
      void play(0);
    }
  }, [ready, play]);

  useEffect(() => {
    const t = setInterval(() => setTime(currentTime()), 200);
    return () => clearInterval(t);
  }, [currentTime]);

  function choose(m: Mode) {
    setMode(m);
    setVocalVolume(m === "music" ? 0 : 1);
    setMusicVolume(m === "vocals" ? 0 : 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {MODES.map(({ mode: m, label }) => (
          <button
            key={m}
            onClick={() => choose(m)}
            aria-pressed={mode === m}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              mode === m ? "border-accent bg-accent text-black" : "border-white/15 text-white/70 hover:border-white/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mt-4 h-40 overflow-hidden rounded-xl bg-black/40">
        <Spectrum analyser={player.analyser} className="h-full w-full" />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/50">Cargando pistas…</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => (player.playing ? player.pause() : void player.play())}
          disabled={!ready}
          className="h-11 w-11 shrink-0 rounded-full bg-accent text-lg font-black text-black disabled:opacity-40"
          aria-label={player.playing ? "Pausar" : "Reproducir"}
        >
          {player.playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={player.duration || 1}
          step={0.1}
          value={time}
          onChange={(e) => player.seek(Number(e.target.value))}
          className="flex-1"
          aria-label="Posición"
        />
        <span className="w-24 shrink-0 text-right font-mono text-xs text-white/60">
          {formatTime(time)} / {formatTime(player.duration)}
        </span>
      </div>
    </div>
  );
}
