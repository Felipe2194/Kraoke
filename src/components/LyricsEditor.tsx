"use client";

import { useEffect, useRef, useState } from "react";
import { updateSong } from "@/lib/db";
import {
  lineEnd,
  lineStart,
  lineText,
  newLine,
  setLineBounds,
  setLineText,
  shiftLine,
} from "@/lib/lyrics";
import { useStemPlayer } from "@/lib/player";
import type { Line, SongMeta } from "@/lib/types";
import KaraokeCanvas from "./KaraokeCanvas";
import Transport from "./Transport";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};

export default function LyricsEditor({ song, onChange }: { song: SongMeta; onChange: (s: SongMeta) => void }) {
  const player = useStemPlayer(song.id);
  const { currentTime } = player;
  const [time, setTime] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lines = song.lines;

  useEffect(() => {
    const t = setInterval(() => setTime(currentTime()), 200);
    return () => clearInterval(t);
  }, [currentTime]);

  function commit(next: Line[]) {
    const sorted = [...next].sort((a, b) => lineStart(a) - lineStart(b));
    onChange({ ...song, lines: sorted });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void updateSong(song.id, { lines: sorted }), 400);
  }

  const replace = (i: number, line: Line) => commit(lines.map((l, j) => (j === i ? line : l)));

  const activeIdx = lines.findIndex((l, i) => time >= lineStart(l) && (i === lines.length - 1 || time < lineStart(lines[i + 1])));

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Letra</h2>
          <p className="text-sm text-white/50">
            Corregí las palabras mal detectadas. Mientras suena, usá ⏱ para marcar dónde arranca cada verso.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-white/50">Mover toda la letra:</span>
          <button className="rounded border border-white/15 px-2 py-1" onClick={() => commit(lines.map((l) => shiftLine(l, -0.1)))}>
            −0.1 s
          </button>
          <button className="rounded border border-white/15 px-2 py-1" onClick={() => commit(lines.map((l) => shiftLine(l, 0.1)))}>
            +0.1 s
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <KaraokeCanvas
            lines={lines}
            title={song.title}
            getTime={player.currentTime}
            className="aspect-video w-full rounded-2xl border border-white/10"
          />
          <Transport player={player} time={time} />
        </div>

        <ol className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {lines.length === 0 && (
            <li className="rounded-xl bg-white/5 p-4 text-sm text-white/60">
              No se detectó letra. Podés agregar versos a mano.
            </li>
          )}
          {lines.map((line, i) => (
            <li
              key={line.id}
              className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 ${i === activeIdx ? "bg-accent/15" : "hover:bg-white/5"}`}
            >
              <button
                onClick={() => void player.play(Math.max(0, lineStart(line) - 0.5))}
                className="w-14 shrink-0 text-left font-mono text-xs text-white/50 hover:text-accent"
                title="Escuchar desde acá"
              >
                {fmt(lineStart(line))}
              </button>
              <input
                key={lineText(line)}
                defaultValue={lineText(line)}
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  if (text && text !== lineText(line)) replace(i, setLineText(line, text));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 outline-none focus:bg-white/10"
              />
              <div className="flex shrink-0 gap-1 text-xs opacity-60 group-hover:opacity-100">
                <IconButton title="Marcar inicio en el momento actual" onClick={() => {
                  const end = Math.max(lineEnd(line), player.currentTime() + 0.5);
                  replace(i, setLineBounds(line, player.currentTime(), end));
                }}>⏱</IconButton>
                <IconButton title="Adelantar 0.1 s" onClick={() => replace(i, shiftLine(line, -0.1))}>−</IconButton>
                <IconButton title="Atrasar 0.1 s" onClick={() => replace(i, shiftLine(line, 0.1))}>+</IconButton>
                <IconButton title="Agregar verso debajo" onClick={() => {
                  const start = lineEnd(line) + 0.2;
                  const next = lines[i + 1];
                  const end = next ? Math.max(start + 0.5, lineStart(next) - 0.2) : start + 3;
                  commit([...lines.slice(0, i + 1), newLine("…", start, end), ...lines.slice(i + 1)]);
                }}>＋</IconButton>
                <IconButton title="Borrar verso" onClick={() => commit(lines.filter((_, j) => j !== i))}>✕</IconButton>
              </div>
            </li>
          ))}
          {lines.length === 0 && (
            <li>
              <button
                className="mt-2 rounded-full border border-white/15 px-4 py-1.5 text-sm"
                onClick={() => commit([newLine("…", player.currentTime(), player.currentTime() + 3)])}
              >
                + Agregar verso
              </button>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-7 w-7 rounded-md border border-white/10 hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}
