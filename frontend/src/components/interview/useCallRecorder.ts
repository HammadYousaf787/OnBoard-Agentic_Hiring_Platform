"use client";

import { useCallback, useEffect, useRef } from "react";

const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Records the call in the interviewer's browser: draws the remote and local
 * <video> elements onto a canvas (remote large, local picture-in-picture),
 * mixes the local + remote audio through WebAudio, and feeds both into a
 * MediaRecorder. Pause/resume keeps a single file per interview.
 */
export function useCallRecorder({
  getRemoteVideo,
  getLocalVideo,
}: {
  getRemoteVideo: () => HTMLVideoElement | null;
  getLocalVideo: () => HTMLVideoElement | null;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const connectedRef = useRef<Set<string>>(new Set());
  const getRemoteRef = useRef(getRemoteVideo);
  const getLocalRef = useRef(getLocalVideo);
  useEffect(() => {
    getRemoteRef.current = getRemoteVideo;
    getLocalRef.current = getLocalVideo;
  });

  const addAudioTrack = useCallback((track: MediaStreamTrack | null | undefined) => {
    const ctx = audioCtxRef.current;
    const dest = destRef.current;
    if (!ctx || !dest || !track || connectedRef.current.has(track.id)) return;
    connectedRef.current.add(track.id);
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
  }, []);

  const start = useCallback(
    (audioTracks: (MediaStreamTrack | null | undefined)[]) => {
      if (recorderRef.current) return;

      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const g = canvas.getContext("2d")!;

      const draw = () => {
        g.fillStyle = "#0f172a";
        g.fillRect(0, 0, WIDTH, HEIGHT);
        const remote = getRemoteRef.current();
        const local = getLocalRef.current();
        const fit = (v: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
          if (!v.videoWidth) return;
          const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
          const dw = v.videoWidth * scale;
          const dh = v.videoHeight * scale;
          g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        };
        if (remote) fit(remote, 0, 0, WIDTH, HEIGHT);
        if (local) {
          const w = 320;
          const h = 180;
          g.fillStyle = "#000";
          g.fillRect(WIDTH - w - 24, HEIGHT - h - 24, w, h);
          fit(local, WIDTH - w - 24, HEIGHT - h - 24, w, h);
        }
      };
      draw();
      timerRef.current = window.setInterval(draw, 66);

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      destRef.current = ctx.createMediaStreamDestination();
      connectedRef.current = new Set();
      audioTracks.forEach(addAudioTrack);

      const stream = new MediaStream([
        ...canvas.captureStream(15).getVideoTracks(),
        ...destRef.current.stream.getAudioTracks(),
      ]);
      const mime = ["video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(2000);
      recorderRef.current = recorder;
    },
    [addAudioTrack]
  );

  const pause = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    const cleanup = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      destRef.current = null;
      recorderRef.current = null;
    };
    if (!recorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" })
          : null;
        chunksRef.current = [];
        cleanup();
        resolve(blob);
      };
      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
        recorder.stop();
      }
    });
  }, []);

  return { start, stop, pause, resume, addAudioTrack, isActive: () => recorderRef.current !== null };
}
