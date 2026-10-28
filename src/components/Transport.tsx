"use client";

import { formatTime } from "@/lib/lyrics";
import type { StemPlayer } from "@/lib/player";

export default function Transport({ player, time, compact = false }: { player: StemPlayer; time: number; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? "" : "mt-3"}`}>
      <button
        onClick={() => (player.playing ? player.pause() : void player.play())}
        disabled={!player.ready}
        className="h-11 w-11 shrink-0 rounded-full bg-accent text-lg font-black text-black disabled:opacity-40"
        aria-label={player.playing ? "Pausar" : "Reproducir"}
      >
        {player.playing ? "❚❚" : "▶"}
      </button>
      <span className="w-24 shrink-0 font-mono text-xs text-white/60">
        {formatTime(time)} / {formatTime(player.duration)}
      </span>
      <input
        type="range"
        min={0}
        max={player.duration || 1}
        step={0.1}
        value={time}
        onChange={(e) => player.seek(Number(e.target.value))}
        className="min-w-32 flex-1"
        aria-label="Posición"
      />
      <label className="flex items-center gap-2 text-xs text-white/60">
        Voz guía
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={player.vocalVolume}
          onChange={(e) => player.setVocalVolume(Number(e.target.value))}
          className="w-20"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/60">
        Música
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={player.musicVolume}
          onChange={(e) => player.setMusicVolume(Number(e.target.value))}
          className="w-20"
        />
      </label>
    </div>
  );
}
