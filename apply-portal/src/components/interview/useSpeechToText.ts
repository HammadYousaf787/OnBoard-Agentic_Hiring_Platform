"use client";

import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FATAL_ERRORS = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"];

function describeError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "The browser blocked speech recognition. Allow microphone access for this site in the browser's site settings, then toggle Transcribe off and on.";
    case "audio-capture":
      return "Speech recognition couldn't find a microphone.";
    case "network":
      return "Couldn't reach the browser's speech service. Chrome and Edge send audio to their own servers for transcription, so this needs an internet connection.";
    case "language-not-supported":
      return "This browser doesn't support speech recognition for the selected language.";
    default:
      return `Speech recognition error: ${code}`;
  }
}

/**
 * Browser-native speech-to-text (Web Speech API) for the local microphone.
 * Each participant transcribes only their own voice, so the speaker is
 * always known. Calls `onFinal` with each finished utterance. Failures are
 * reported through `error` instead of being swallowed.
 */
export function useSpeechToText({
  active,
  onFinal,
  lang = "en-US",
}: {
  active: boolean;
  onFinal: (text: string) => void;
  lang?: string;
}) {
  const [supported] = useState(() => getCtor() !== null);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor || !active) return;

    const recognition = new Ctor();
    let stopped = false;
    let restartTimer: number | null = null;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      setError(null);
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text) onFinalRef.current(text);
        } else {
          interimText += text + " ";
        }
      }
      setInterim(interimText.trim());
    };
    recognition.onerror = (e) => {
      // "no-speech" and "aborted" are routine pauses; onend restarts the session.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(describeError(e.error));
      if (FATAL_ERRORS.includes(e.error)) stopped = true;
    };
    recognition.onend = () => {
      setInterim("");
      setListening(false);
      if (stopped) return;
      restartTimer = window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // already started
        }
      }, 400);
    };

    try {
      recognition.start();
    } catch {
      // ignore
    }

    return () => {
      stopped = true;
      if (restartTimer) window.clearTimeout(restartTimer);
      recognition.onend = null;
      recognition.stop();
      setInterim("");
      setListening(false);
    };
  }, [active, lang]);

  return {
    supported,
    interim: active ? interim : "",
    listening: active && listening,
    error: active ? error : null,
  };
}
