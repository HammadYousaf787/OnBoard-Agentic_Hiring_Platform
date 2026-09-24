"use client";

import { useEffect, useRef, useState } from "react";

// Tuning knobs. RMS is the loudness of the mic signal (0..1): typical room noise is
// well under 0.01, normal speech is 0.03-0.2.
const SPEECH_RMS = 0.015;
const CHECK_MS = 100;
const PAUSE_MS = 700; // this much quiet after speech ends a clip...
const MIN_CLIP_MS = 3000; // ...but never cut a clip shorter than this
const MAX_CLIP_MS = 12000; // ...and always cut by here
const MIN_SPEECH_MS = 400; // clips with less speech than this aren't sent

export type ClipUploader = (clip: Blob, durationMs: number) => Promise<void>;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Cuts the local microphone into short, self-contained audio clips at natural pauses
 * and hands each one to `upload` (which sends it to the backend for OpenAI
 * transcription). Each participant only ever sends THEIR OWN microphone, so the
 * speaker of every clip is known without any speaker separation.
 *
 * Why not just a timer? A clip cut mid-word transcribes badly, so we wait for a pause
 * (or 12 s). Why restart a recorder per clip instead of MediaRecorder's timeslice?
 * Timeslice chunks after the first aren't independently decodable. Clips that hold no
 * speech are dropped locally (also stops speech models inventing text on silence).
 * Uploads are sent one at a time so a person's own clips arrive in order.
 */
export function useChunkedTranscription({
  active,
  getTrack,
  upload,
}: {
  active: boolean;
  getTrack: () => MediaStreamTrack | null;
  upload: ClipUploader;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);

  const uploadRef = useRef(upload);
  const getTrackRef = useRef(getTrack);
  useEffect(() => {
    uploadRef.current = upload;
    getTrackRef.current = getTrack;
  });

  useEffect(() => {
    if (!active) return;
    const mimeType = pickMimeType();
    if (!mimeType || typeof AudioContext === "undefined") {
      setError("This browser can't record audio for AI transcription.");
      return;
    }

    let disposed = false;
    let startTimer: number | null = null;
    let checkTimer: number | null = null;
    let ctx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let queue: Promise<void> = Promise.resolve();
    let failures = 0;
    let cleanupFlush: (() => void) | null = null;

    const enqueue = (clip: Blob, ms: number) => {
      queue = queue
        .then(() => uploadRef.current(clip, ms))
        .then(() => {
          failures = 0;
          setError(null);
          setSent((n) => n + 1);
        })
        .catch((err: unknown) => {
          failures += 1;
          if (failures >= 2) {
            setError(err instanceof Error ? err.message : "Couldn't send audio for transcription.");
          }
        });
    };

    const begin = (track: MediaStreamTrack) => {
      const stream = new MediaStream([track]);
      ctx = new AudioContext();
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      let clipStart = performance.now();
      let lastVoice = 0;
      let speechMs = 0;
      let chunks: Blob[] = [];

      const startRecorder = () => {
        // Each recorder writes into its OWN array: its final dataavailable event fires
        // after the next recorder has already started.
        const mine: Blob[] = [];
        chunks = mine;
        clipStart = performance.now();
        lastVoice = 0;
        speechMs = 0;
        const r = new MediaRecorder(stream, { mimeType });
        r.ondataavailable = (e) => e.data.size > 0 && mine.push(e.data);
        r.start();
        recorder = r;
      };

      // Finish the current clip and (unless we're shutting down) start the next one.
      const cut = (restart: boolean) => {
        const r = recorder;
        if (!r || r.state === "inactive") return;
        const ms = performance.now() - clipStart;
        const spoke = speechMs >= MIN_SPEECH_MS;
        const collected = chunks;
        r.onstop = () => {
          if (spoke && collected.length > 0) {
            enqueue(new Blob(collected, { type: mimeType.split(";")[0] }), Math.round(ms));
          }
        };
        r.stop();
        if (restart) startRecorder();
      };

      startRecorder();
      setListening(true);

      checkTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const now = performance.now();
        if (Math.sqrt(sum / samples.length) > SPEECH_RMS) {
          speechMs += CHECK_MS;
          lastVoice = now;
        }
        const elapsed = now - clipStart;
        const pausedLongEnough = speechMs > 0 && lastVoice > 0 && now - lastVoice >= PAUSE_MS;
        if ((elapsed >= MIN_CLIP_MS && pausedLongEnough) || elapsed >= MAX_CLIP_MS) cut(true);
      }, CHECK_MS);

      // Stored so cleanup can flush the last partial clip.
      cleanupFlush = () => cut(false);
    };

    // The microphone track may not exist yet right after joining: retry until it does.
    const tryStart = () => {
      if (disposed) return;
      const track = getTrackRef.current();
      if (!track) {
        startTimer = window.setTimeout(tryStart, 500);
        return;
      }
      begin(track);
    };
    tryStart();

    return () => {
      disposed = true;
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (checkTimer !== null) window.clearInterval(checkTimer);
      cleanupFlush?.();
      window.setTimeout(() => void ctx?.close().catch(() => {}), 200);
      setListening(false);
    };
  }, [active]);

  return { listening, error, sent };
}
