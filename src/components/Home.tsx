"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCapabilities } from "@/lib/capabilities";
import { deleteSong, listSongs, putFile, putSong } from "@/lib/db";
import { LANGUAGES, languageName } from "@/lib/languages";
import { formatTime } from "@/lib/lyrics";
import type { SongMeta, WhisperQuality } from "@/lib/types";

const STATUS_LABEL: Record<SongMeta["status"], string> = {
  pending: "En espera",
  separating: "Separando…",
  transcribing: "Transcribiendo…",
  ready: "Lista",
  error: "Error",
};

export default function Home() {
  const router = useRouter();
  const caps = useCapabilities();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState<WhisperQuality>("accurate");
  const [language, setLanguage] = useState("");
  const [songs, setSongs] = useState<SongMeta[]>([]);

  useEffect(() => {
    listSongs().then(setSongs);
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(file.name)) {
      alert("Ese archivo no parece ser de audio.");
      return;
    }
    const id = crypto.randomUUID();
    await putFile(id, file);
    await putSong({
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      createdAt: Date.now(),
      duration: 0,
      status: "pending",
      quality,
      lines: [],
    });
    router.push(`/cancion/${id}${language ? `?lang=${language}` : ""}`);
  }

  async function remove(id: string) {
    await deleteSong(id);
    setSongs((s) => s.filter((x) => x.id !== id));
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-black tracking-tight">
          <span className="text-accent">K</span>raoke
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-white/70">
          Subí cualquier canción y en minutos tenés la pista sin voz, la acapella y la letra sincronizada para cantar.
        </p>
      </header>

      {caps && (caps.mobile || !caps.webgpu || !caps.isolated) && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          {caps.mobile ? (
            <>Estás en un celular. El procesamiento necesita mucha memoria y probablemente falle o tarde mucho: te recomendamos usar una computadora con Chrome o Edge.</>
          ) : !caps.webgpu ? (
            <>Tu navegador no tiene WebGPU, así que la separación va a usar el procesador y puede tardar bastante más. Para mejores resultados usá Chrome o Edge actualizados.</>
          ) : (
            <>El sitio no está aislado (cross-origin isolation): el procesamiento va a funcionar más lento.</>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-16 text-center transition ${
          dragging ? "border-accent bg-accent/10" : "border-white/20 bg-white/5 hover:border-white/40"
        }`}
      >
        <div className="text-5xl">🎤</div>
        <p className="mt-4 text-xl font-semibold">Arrastrá una canción acá</p>
        <p className="mt-1 text-white/60">o hacé clic para elegirla (MP3, WAV, M4A, FLAC…)</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/70">
        <label className="flex items-center gap-2">
          Letra:
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as WhisperQuality)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1"
          >
            <option value="accurate">Precisa (descarga ~250 MB la primera vez)</option>
            <option value="fast">Rápida (descarga ~80 MB)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Idioma:
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1"
          >
            <option value="">Detectar automáticamente</option>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-center text-xs text-white/40">
        Todo se procesa en tu computadora: la canción nunca se sube a ningún servidor.
      </p>

      {songs.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-bold">Tus canciones</h2>
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {songs.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-4 py-3">
                <Link href={`/cancion/${s.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold hover:text-accent">{s.title}</p>
                  <p className="text-xs text-white/50">
                    {STATUS_LABEL[s.status]}
                    {s.duration ? ` · ${formatTime(s.duration)}` : ""}
                    {s.language ? ` · ${languageName(s.language)}` : ""}
                  </p>
                </Link>
                {s.status === "ready" && (
                  <Link
                    href={`/cancion/${s.id}/karaoke`}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-black"
                  >
                    Cantar
                  </Link>
                )}
                <button
                  onClick={() => remove(s.id)}
                  className="text-sm text-white/40 hover:text-red-400"
                  aria-label={`Borrar ${s.title}`}
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {[
          ["🎙️ Solo la voz", "La acapella aislada, para remixes o estudiar la interpretación."],
          ["🎸 Solo la música", "La pista instrumental limpia, lista para cantar en vivo."],
          ["📦 Todo el paquete", "Voz y música por separado en un ZIP, con la letra sincronizada."],
          ["📺 Karaoke", "Pantalla completa para la tele, o un video MP4 para llevar en un pendrive."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="font-bold">{t}</p>
            <p className="mt-1 text-sm text-white/60">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
