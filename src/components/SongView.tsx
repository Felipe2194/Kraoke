"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSong, updateSong } from "@/lib/db";
import { languageName, LANGUAGES } from "@/lib/languages";
import { formatTime } from "@/lib/lyrics";
import { processSong, type PipelineProgress, type Stage } from "@/lib/pipeline";
import type { SongMeta } from "@/lib/types";
import Downloads from "./Downloads";
import LyricsEditor from "./LyricsEditor";

const STAGES: { stage: Stage; label: string }[] = [
  { stage: "decode", label: "Leyendo el audio" },
  { stage: "download-separator", label: "Descargando el separador (solo la primera vez)" },
  { stage: "separate", label: "Separando voz y música" },
  { stage: "download-whisper", label: "Descargando el modelo de letras (solo la primera vez)" },
  { stage: "language", label: "Detectando el idioma" },
  { stage: "transcribe", label: "Transcribiendo la letra" },
];

export default function SongView() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<SongMeta | null | undefined>(undefined);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const running = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  async function run(current: SongMeta, language: string | null) {
    if (running.current) return;
    running.current = true;
    setIsRunning(true);
    setStartedAt(Date.now());
    setSong({ ...current, status: current.status === "ready" || current.status === "error" ? "transcribing" : current.status });
    const result = await processSong(current, setProgress, language);
    running.current = false;
    setIsRunning(false);
    setProgress(null);
    setSong(result);
  }

  useEffect(() => {
    getSong(id).then((s) => {
      setSong(s ?? null);
      if (s && s.status !== "ready" && s.status !== "error") {
        const lang = new URLSearchParams(window.location.search).get("lang");
        void run(s, lang);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  if (song === undefined) return <main className="p-10 text-center text-white/50">Cargando…</main>;
  if (song === null)
    return (
      <main className="p-10 text-center">
        <p>No encontramos esta canción en este navegador.</p>
        <Link href="/" className="mt-4 inline-block text-accent underline">
          Volver al inicio
        </Link>
      </main>
    );

  const processing = song.status === "pending" || song.status === "separating" || song.status === "transcribing";
  const currentIdx = progress ? STAGES.findIndex((s) => s.stage === progress.stage) : -1;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm text-white/50 hover:text-white">
        ← Inicio
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <input
            value={song.title}
            onChange={(e) => setSong({ ...song, title: e.target.value })}
            onBlur={(e) => updateSong(song.id, { title: e.target.value })}
            className="w-full bg-transparent text-3xl font-black outline-none focus:underline"
            aria-label="Título"
          />
          <p className="text-sm text-white/50">
            {song.fileName}
            {song.duration ? ` · ${formatTime(song.duration)}` : ""}
            {song.language ? ` · ${languageName(song.language)}` : ""}
          </p>
        </div>
        {song.status === "ready" && (
          <Link
            href={`/cancion/${song.id}/karaoke`}
            className="rounded-full bg-accent px-6 py-3 text-lg font-black text-black shadow-lg shadow-accent/30 hover:brightness-110"
          >
            🎤 Abrir sala de karaoke
          </Link>
        )}
      </div>

      {processing && (
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-bold">Procesando en tu computadora…</h2>
          <p className="mt-1 text-sm text-white/50">
            No cierres esta pestaña. Puede tardar varios minutos según tu equipo.
            {startedAt > 0 && now > startedAt && ` Tiempo transcurrido: ${formatTime((now - startedAt) / 1000)}.`}
          </p>
          <ol className="mt-5 space-y-3">
            {STAGES.map((s, i) => {
              const active = i === currentIdx;
              const done = currentIdx > i;
              return (
                <li key={s.stage} className={done ? "text-white/40" : active ? "text-white" : "text-white/30"}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center">{done ? "✓" : active ? "●" : "○"}</span>
                    <span className="flex-1">{s.label}</span>
                    {active && progress?.detail && <span className="text-xs text-white/50">{progress.detail}</span>}
                  </div>
                  {active && (
                    <div className="ml-8 mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.round(progress!.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {!progress && !isRunning && (
            <button onClick={() => run(song, null)} className="mt-5 rounded-full bg-accent px-5 py-2 font-bold text-black">
              Reanudar
            </button>
          )}
        </section>
      )}

      {song.status === "error" && (
        <section className="mt-8 rounded-2xl border border-red-400/30 bg-red-400/10 p-6">
          <h2 className="font-bold text-red-200">Algo salió mal</h2>
          <p className="mt-1 font-mono text-sm text-red-100/80">{song.error}</p>
          <button onClick={() => run(song, null)} className="mt-4 rounded-full bg-white px-5 py-2 font-bold text-black">
            Reintentar
          </button>
        </section>
      )}

      {song.status === "ready" && (
        <>
          <Downloads song={song} />
          <LyricsEditor song={song} onChange={setSong} />
          <section className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
            <span className="text-white/60">¿La letra salió muy mal? Volvé a transcribirla en:</span>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <button
                key={code}
                onClick={() => {
                  if (confirmReplace()) void run(song, code);
                }}
                className="rounded-full border border-white/15 px-3 py-1 hover:border-accent"
              >
                {name}
              </button>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

const confirmReplace = () => window.confirm("Esto reemplaza la letra actual, incluidas tus correcciones. ¿Seguir?");
