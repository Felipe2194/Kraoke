"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSong, updateSong } from "@/lib/db";
import { LANGUAGES, languageName } from "@/lib/languages";
import { formatTime } from "@/lib/lyrics";
import { separateSong, transcribeSong, type PipelineProgress, type Stage } from "@/lib/pipeline";
import type { SongMeta, WhisperQuality } from "@/lib/types";
import { AudioDownloads, VideoExport } from "./Downloads";
import LyricsEditor from "./LyricsEditor";
import StemPreview from "./StemPreview";

const SEPARATION_STAGES: { stage: Stage; label: string }[] = [
  { stage: "decode", label: "Leyendo el audio" },
  { stage: "download-separator", label: "Descargando el separador (solo la primera vez)" },
  { stage: "separate", label: "Separando voz y música" },
];

const LYRICS_STAGES: { stage: Stage; label: string }[] = [
  { stage: "download-whisper", label: "Descargando el modelo de letras (solo la primera vez)" },
  { stage: "language", label: "Detectando el idioma" },
  { stage: "transcribe", label: "Transcribiendo la letra" },
];

type Job = "separate" | "lyrics";

export default function SongView() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<SongMeta | null | undefined>(undefined);
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const running = useRef(false);

  async function start(kind: Job, current: SongMeta, fn: () => Promise<SongMeta>) {
    if (running.current) return;
    running.current = true;
    setJob(kind);
    setProgress(null);
    setSong(kind === "separate" ? { ...current, status: "separating" } : { ...current, lyricsStatus: "transcribing" });
    const result = await fn();
    running.current = false;
    setJob(null);
    setProgress(null);
    setSong(result);
  }

  const separate = (s: SongMeta) => start("separate", s, () => separateSong(s, setProgress));
  const makeLyrics = (s: SongMeta, opts: LyricsOptions) => start("lyrics", s, () => transcribeSong(s, opts, setProgress));

  useEffect(() => {
    getSong(id).then((s) => {
      setSong(s ?? null);
      // Separation starts by itself; the karaoke only when the user asks.
      if (s && (s.status === "pending" || s.status === "separating")) void separate(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const separated = song.status === "separated";

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm text-white/50 hover:text-white">
        ← Inicio
      </Link>
      <div className="mt-3 min-w-0">
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

      <section className="mt-8">
        <SectionTitle
          title="1. Voz y música"
          time={separated && song.separationSeconds ? `separado en ${formatTime(song.separationSeconds)}` : undefined}
        />
        {job === "separate" ? (
          <Progress stages={SEPARATION_STAGES} progress={progress} />
        ) : song.status === "error" ? (
          <ErrorBox message={song.error} onRetry={() => separate(song)} />
        ) : separated ? (
          <>
            <StemPreview songId={song.id} />
            <AudioDownloads song={song} />
          </>
        ) : (
          <Interrupted onResume={() => separate(song)} />
        )}
      </section>

      {separated && (
        <section className="mt-12">
          <SectionTitle
            title="2. Karaoke"
            time={
              song.lyricsStatus === "ready" && song.transcriptionSeconds
                ? `letra generada en ${formatTime(song.transcriptionSeconds)}`
                : undefined
            }
          />
          {job === "lyrics" ? (
            <Progress stages={LYRICS_STAGES} progress={progress} />
          ) : song.lyricsStatus === "ready" ? (
            <KaraokeReady song={song} onChange={setSong} onRedo={(opts) => makeLyrics(song, opts)} />
          ) : (
            <>
              {song.lyricsStatus === "error" && <ErrorBox message={song.lyricsError} />}
              {song.lyricsStatus === "transcribing" && (
                <p className="mb-3 text-sm text-amber-200">La generación de la letra se interrumpió. Podés volver a empezarla.</p>
              )}
              <KaraokeSetup song={song} onStart={(opts) => makeLyrics(song, opts)} />
            </>
          )}
        </section>
      )}
    </main>
  );
}

function SectionTitle({ title, time }: { title: string; time?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-bold">{title}</h2>
      {time && <span className="text-xs text-white/40">{time}</span>}
    </div>
  );
}

function Progress({ stages, progress }: { stages: { stage: Stage; label: string }[]; progress: PipelineProgress | null }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const currentIdx = progress ? stages.findIndex((s) => s.stage === progress.stage) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="font-bold">Procesando en tu computadora…</p>
      <p className="mt-1 text-sm text-white/50">
        No cierres esta pestaña. Tiempo transcurrido: {formatTime((now - startedAt) / 1000)}.
      </p>
      <ol className="mt-5 space-y-3">
        {stages.map((s, i) => {
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
                    style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
      <p className="font-bold text-red-200">Algo salió mal</p>
      <p className="mt-1 font-mono text-sm text-red-100/80">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-full bg-white px-5 py-2 font-bold text-black">
          Reintentar
        </button>
      )}
    </div>
  );
}

function Interrupted({ onResume }: { onResume: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-white/60">La separación se interrumpió.</p>
      <button onClick={onResume} className="mt-3 rounded-full bg-accent px-5 py-2 font-bold text-black">
        Reanudar
      </button>
    </div>
  );
}

type LyricsOptions = { quality: WhisperQuality; language: string | null };

function LyricsOptionsForm({
  song,
  submitLabel,
  onSubmit,
}: {
  song: SongMeta;
  submitLabel: string;
  onSubmit: (opts: LyricsOptions) => void;
}) {
  const [quality, setQuality] = useState<WhisperQuality>(song.quality ?? "accurate");
  const [language, setLanguage] = useState(song.language ?? "");
  const select = "rounded-lg border border-white/15 bg-background px-3 py-2 text-sm text-foreground";

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Letra
        <select value={quality} onChange={(e) => setQuality(e.target.value as WhisperQuality)} className={select}>
          <option value="accurate">Precisa (descarga ~250 MB la primera vez)</option>
          <option value="fast">Rápida (descarga ~80 MB, más errores)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Idioma
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={select}>
          <option value="">Detectar automáticamente</option>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => onSubmit({ quality, language: language || null })}
        className="rounded-full bg-accent px-6 py-2.5 font-bold text-black hover:brightness-110"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function KaraokeSetup({ song, onStart }: { song: SongMeta; onStart: (opts: LyricsOptions) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="font-bold">🎤 Crear el karaoke</p>
      <p className="mb-5 mt-1 text-sm text-white/60">
        Transcribimos la voz separada y sincronizamos cada palabra. Después vas a poder corregir la letra, abrir la sala
        de karaoke y generar el video.
      </p>
      <LyricsOptionsForm song={song} submitLabel="Crear karaoke" onSubmit={onStart} />
    </div>
  );
}

function KaraokeReady({
  song,
  onChange,
  onRedo,
}: {
  song: SongMeta;
  onChange: (s: SongMeta) => void;
  onRedo: (opts: LyricsOptions) => void;
}) {
  const [redo, setRedo] = useState(false);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-accent/40 bg-accent/10 p-5">
          <p className="font-bold">🎤 Sala de karaoke</p>
          <p className="mt-1 flex-1 text-sm text-white/60">
            Pantalla completa con la letra al ritmo de la música, ideal para la tele o un proyector.
          </p>
          <Link
            href={`/cancion/${song.id}/karaoke`}
            className="mt-4 rounded-full bg-accent px-4 py-2 text-center text-sm font-black text-black hover:brightness-110"
          >
            Abrir sala de karaoke
          </Link>
        </div>
        <VideoExport song={song} />
      </div>

      <LyricsEditor song={song} onChange={onChange} />

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
        {redo ? (
          <>
            <p className="mb-4 text-white/60">Volver a generar la letra reemplaza la actual, incluidas tus correcciones.</p>
            <LyricsOptionsForm song={song} submitLabel="Volver a generar" onSubmit={onRedo} />
          </>
        ) : (
          <button onClick={() => setRedo(true)} className="text-white/60 underline hover:text-white">
            ¿La letra salió muy mal? Volver a generarla con otra calidad o idioma
          </button>
        )}
      </div>
    </>
  );
}
