"use client";

import { useRef, useState } from "react";
import { encodeWav } from "@/lib/audio";
import { getStem } from "@/lib/db";
import { downloadBlob, safeName } from "@/lib/download";
import { lineText, toLrc } from "@/lib/lyrics";
import type { SongMeta, StemKind } from "@/lib/types";
import { renderKaraokeVideo } from "@/lib/video";

const RESOLUTIONS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

const card = "flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5";
const button =
  "mt-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-black hover:bg-accent disabled:cursor-wait disabled:opacity-50";

async function stem(song: SongMeta, kind: StemKind) {
  const pcm = await getStem(song.id, kind);
  if (!pcm) throw new Error("No se encontró la pista");
  return pcm;
}

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }
  return [busy, run] as const;
}

/** Voice, music and the ZIP with both. Available as soon as the audio is separated. */
export function AudioDownloads({ song }: { song: SongMeta }) {
  const [busy, run] = useBusy();
  const name = safeName(song.title);
  const hasLyrics = song.lyricsStatus === "ready" && song.lines.length > 0;

  const downloadStem = (kind: "vocals" | "instrumental") =>
    run(kind, async () => {
      downloadBlob(encodeWav(await stem(song, kind)), `${name} (${kind === "vocals" ? "voz" : "instrumental"}).wav`);
    });

  const downloadZip = () =>
    run("zip", async () => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file(`${name} (voz).wav`, encodeWav(await stem(song, "vocals")));
      zip.file(`${name} (instrumental).wav`, encodeWav(await stem(song, "instrumental")));
      if (hasLyrics) {
        zip.file(`${name}.lrc`, toLrc(song.lines, song.title));
        zip.file(`${name} (letra).txt`, song.lines.map(lineText).join("\n"));
        zip.file("kraoke.json", JSON.stringify({ title: song.title, language: song.language, lines: song.lines }, null, 2));
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${name} (kraoke).zip`);
    });

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className={card}>
        <p className="font-bold">🎙️ Solo la voz</p>
        <p className="mt-1 flex-1 text-sm text-white/60">Acapella en WAV.</p>
        <button className={button} disabled={!!busy} onClick={() => downloadStem("vocals")}>
          {busy === "vocals" ? "Preparando…" : "Descargar"}
        </button>
      </div>
      <div className={card}>
        <p className="font-bold">🎸 Solo la música</p>
        <p className="mt-1 flex-1 text-sm text-white/60">Pista instrumental en WAV.</p>
        <button className={button} disabled={!!busy} onClick={() => downloadStem("instrumental")}>
          {busy === "instrumental" ? "Preparando…" : "Descargar"}
        </button>
      </div>
      <div className={card}>
        <p className="font-bold">📦 Todo el paquete</p>
        <p className="mt-1 flex-1 text-sm text-white/60">
          ZIP con la voz y la música{hasLyrics ? ", más la letra sincronizada (.lrc)" : ""}.
        </p>
        <button className={button} disabled={!!busy} onClick={downloadZip}>
          {busy === "zip" ? "Comprimiendo…" : "Descargar ZIP"}
        </button>
      </div>
    </div>
  );
}

/** Renders the karaoke MP4 only when asked, since it takes a while. */
export function VideoExport({ song }: { song: SongMeta }) {
  const [busy, run] = useBusy();
  const [progress, setProgress] = useState<number | null>(null);
  const [resolution, setResolution] = useState<keyof typeof RESOLUTIONS>("720p");
  const abort = useRef<AbortController | null>(null);

  const generate = () =>
    run("video", async () => {
      abort.current = new AbortController();
      setProgress(0);
      try {
        const blob = await renderKaraokeVideo(
          song.lines,
          await stem(song, "instrumental"),
          song.title,
          { ...RESOLUTIONS[resolution], fps: 25 },
          setProgress,
          abort.current.signal,
        );
        downloadBlob(blob, `${safeName(song.title)} (karaoke).mp4`);
      } finally {
        setProgress(null);
      }
    });

  return (
    <div className={card}>
      <p className="font-bold">📺 Video karaoke</p>
      <p className="mt-1 flex-1 text-sm text-white/60">MP4 con la pista y la letra animada, para un pendrive o la tele.</p>
      {progress !== null ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/60">
            <span>Generando… {Math.round(progress * 100)}%</span>
            <button onClick={() => abort.current?.abort()} className="hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as keyof typeof RESOLUTIONS)}
            className="rounded-full border border-white/15 bg-transparent px-3 text-sm"
            aria-label="Resolución"
          >
            {Object.keys(RESOLUTIONS).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button className={`${button} mt-0 flex-1`} disabled={!!busy} onClick={generate}>
            Generar video
          </button>
        </div>
      )}
    </div>
  );
}
