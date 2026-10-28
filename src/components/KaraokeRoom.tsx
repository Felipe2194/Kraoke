"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSong } from "@/lib/db";
import { useStemPlayer } from "@/lib/player";
import type { SongMeta } from "@/lib/types";
import KaraokeCanvas from "./KaraokeCanvas";
import Transport from "./Transport";

export default function KaraokeRoom() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<SongMeta | null | undefined>(undefined);
  const player = useStemPlayer(id);
  const { currentTime } = player;
  const [time, setTime] = useState(0);
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSong(id).then((s) => setSong(s ?? null));
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setTime(currentTime()), 250);
    return () => clearInterval(t);
  }, [currentTime]);

  const poke = () => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (player.playing) player.pause();
        else void player.play();
      } else if (e.key === "f") toggleFullscreen();
      else if (e.key === "ArrowLeft") player.seek(Math.max(0, player.currentTime() - 5));
      else if (e.key === "ArrowRight") player.seek(player.currentTime() + 5);
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  }

  if (song === null || (song && song.lyricsStatus !== "ready"))
    return (
      <main className="p-10 text-center">
        <p>
          {song ? "Todavía no creaste el karaoke de esta canción." : "No encontramos esta canción en este navegador."}
        </p>
        {song && (
          <Link href={`/cancion/${id}`} className="mt-4 mr-4 inline-block text-accent underline">
            Crear el karaoke
          </Link>
        )}
        <Link href="/" className="mt-4 inline-block text-accent underline">
          Volver al inicio
        </Link>
      </main>
    );

  return (
    <div
      ref={rootRef}
      onMouseMove={poke}
      onClick={poke}
      className={`fixed inset-0 bg-black ${controls ? "" : "cursor-none"}`}
    >
      {song && <KaraokeCanvas lines={song.lines} title={song.title} getTime={player.currentTime} className="h-full w-full" />}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-16 transition-opacity ${
          controls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Transport player={player} time={time} compact />
        <div className="mt-3 flex items-center justify-between text-xs text-white/50">
          <Link href={`/cancion/${id}`} className="hover:text-white">
            ← Editar letra y descargas
          </Link>
          <span>Espacio: reproducir/pausar · ← → : 5 s · F: pantalla completa</span>
          <button onClick={toggleFullscreen} className="rounded-full border border-white/20 px-3 py-1 hover:text-white">
            ⛶ Pantalla completa
          </button>
        </div>
      </div>
    </div>
  );
}
