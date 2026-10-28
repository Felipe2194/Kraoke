"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toAudioBuffer } from "./audio";
import { getStem } from "./db";

/**
 * Plays the instrumental and vocal stems in sync through Web Audio, with a
 * separate volume for the vocals so they can act as a guide voice.
 */
export function useStemPlayer(songId: string) {
  const ctxRef = useRef<AudioContext | null>(null);
  const buffers = useRef<{ inst: AudioBuffer; voc: AudioBuffer } | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const vocalGain = useRef<GainNode | null>(null);
  const musicGain = useRef<GainNode | null>(null);
  // When playing: AudioContext time at which song time 0 happened.
  const startedAt = useRef(0);
  const pausedAt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [vocalVolume, setVocalVolumeState] = useState(0);
  const [musicVolume, setMusicVolumeState] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [inst, voc] = await Promise.all([getStem(songId, "instrumental"), getStem(songId, "vocals")]);
      if (cancelled || !inst || !voc) return;
      const ctx = new AudioContext({ sampleRate: inst.sampleRate });
      const vg = ctx.createGain();
      const mg = ctx.createGain();
      vg.gain.value = 0;
      vg.connect(ctx.destination);
      mg.connect(ctx.destination);
      ctxRef.current = ctx;
      vocalGain.current = vg;
      musicGain.current = mg;
      buffers.current = { inst: toAudioBuffer(inst), voc: toAudioBuffer(voc) };
      setDuration(buffers.current.inst.duration);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      sources.current.forEach((s) => s.stop());
      void ctxRef.current?.close();
    };
  }, [songId]);

  const stopSources = () => {
    sources.current.forEach((s) => {
      s.onended = null;
      s.stop();
    });
    sources.current = [];
  };

  const currentTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return 0;
    return sources.current.length ? ctx.currentTime - startedAt.current : pausedAt.current;
  }, []);

  const play = useCallback(
    async (from?: number) => {
      const ctx = ctxRef.current;
      const b = buffers.current;
      if (!ctx || !b) return;
      await ctx.resume();
      stopSources();
      const offset = Math.max(0, Math.min(from ?? pausedAt.current, b.inst.duration));
      const make = (buffer: AudioBuffer, gain: GainNode) => {
        const s = ctx.createBufferSource();
        s.buffer = buffer;
        s.connect(gain);
        return s;
      };
      const inst = make(b.inst, musicGain.current!);
      const voc = make(b.voc, vocalGain.current!);
      const when = ctx.currentTime + 0.05;
      inst.start(when, offset);
      voc.start(when, offset);
      startedAt.current = when - offset;
      inst.onended = () => {
        sources.current = [];
        pausedAt.current = 0;
        setPlaying(false);
      };
      sources.current = [inst, voc];
      setPlaying(true);
    },
    [],
  );

  const pause = useCallback(() => {
    pausedAt.current = currentTime();
    stopSources();
    setPlaying(false);
  }, [currentTime]);

  const seek = useCallback(
    (t: number) => {
      if (sources.current.length) void play(t);
      else pausedAt.current = t;
    },
    [play],
  );

  const setVocalVolume = useCallback((v: number) => {
    setVocalVolumeState(v);
    if (vocalGain.current) vocalGain.current.gain.value = v;
  }, []);

  const setMusicVolume = useCallback((v: number) => {
    setMusicVolumeState(v);
    if (musicGain.current) musicGain.current.gain.value = v;
  }, []);

  return {
    ready,
    playing,
    duration,
    currentTime,
    play,
    pause,
    seek,
    vocalVolume,
    setVocalVolume,
    musicVolume,
    setMusicVolume,
  };
}

export type StemPlayer = ReturnType<typeof useStemPlayer>;
