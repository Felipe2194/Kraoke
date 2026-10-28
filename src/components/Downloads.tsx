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

export default function Downloads({ song }: { song: SongMeta }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [resolution, setResolution] = useState<keyof typeof RESOLUTIONS>("720p");
  const abort = useRef<AbortController | null>(null);
  const name = safeName(song.title);

  async function stem(kind: StemKind) {
    const pcm = await getStem(song.id, kind);
    if (!pcm) throw new Error("No se encontró la pista");
    return pcm;
  }

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const downloadStem = (kind: "vocals" | "instrumental") =>
    withBusy(kind, async () => {
      downloadBlob(encodeWav(await stem(kind)), `${name} (${kind === "vocals" ? "voz" : "instrumental"}).wav`);
    });

  const downloadZip = () =>
    withBusy("zip", async () => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file(`${name} (voz).wav`, encodeWav(await stem("vocals")));
      zip.file(`${name} (instrumental).wav`, encodeWav(await stem("instrumental")));
      zip.file(`${name}.lrc`, toLrc(song.lines, song.title));
      zip.file(`${name} (letra).txt`, song.lines.map(lineText).join("\n"));
      zip.file("kraoke.json", JSON.stringify({ title: song.title, language: song.language, lines: song.lines }, null, 2));
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${name} (kraoke).zip`);
    });

  const downloadVideo = () =>
    withBusy("video", async () => {
      abort.current = new AbortController();
      setVideoProgress(0);
      try {
        const blob = await renderKaraokeVideo(
          song.lines,
          await stem("instrumental"),
          song.title,
          { ...RESOLUTIONS[resolution], fps: 25 },
          setVideoProgress,
          abort.current.signal,
        );
        downloadBlob(blob, `${name} (karaoke).mp4`);
      } finally {
        setVideoProgress(null);
      }
    });

  const card = "flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5";
  const button =
    "mt-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-black hover:bg-accent disabled:cursor-wait disabled:opacity-50";

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="mt-1 flex-1 text-sm text-white/60">ZIP con voz, música y la letra sincronizada (.lrc).</p>
        <button className={button} disabled={!!busy} onClick={downloadZip}>
          {busy === "zip" ? "Comprimiendo…" : "Descargar ZIP"}
        </button>
      </div>
      <div className={card}>
        <p className="font-bold">📺 Video karaoke</p>
        <p className="mt-1 flex-1 text-sm text-white/60">MP4 con la pista y la letra animada.</p>
        {videoProgress !== null ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-accent" style={{ width: `${Math.round(videoProgress * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/60">
              <span>Generando… {Math.round(videoProgress * 100)}%</span>
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
              className="rounded-full border border-white/15 bg-transparent px-2 text-sm"
              aria-label="Resolución"
            >
              {Object.keys(RESOLUTIONS).map((r) => (
                <option key={r} value={r} className="bg-black">
                  {r}
                </option>
              ))}
            </select>
            <button className={`${button} mt-0 flex-1`} disabled={!!busy} onClick={downloadVideo}>
              Generar
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
