"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Film,
  Loader2,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { useAssistantCollapsed } from "@/components/layout/useAssistantCollapsed";
import {
  apiGetPendingAssistantConfirmation,
  apiResumeAssistant,
  apiSendAssistantMessage,
  apiTranscribeAudio,
  ApiError,
  AssistantAttachment,
  AssistantInterrupt,
} from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  attachments?: AssistantAttachment[];
}

function interruptTitle(interrupt: AssistantInterrupt): string {
  const title = interrupt.payload.title;
  return typeof title === "string" ? title : `Confirm: ${interrupt.action}`;
}

function interruptItems(interrupt: AssistantInterrupt): string[] {
  const items = interrupt.payload.items;
  return Array.isArray(items) ? items.filter((i): i is string => typeof i === "string") : [];
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)/g;

/** Chat text with URLs (and markdown [label](url) links) made clickable. */
function LinkedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    let label = m[1];
    let url = m[2] ?? m[3];
    let trailing = "";
    if (!m[2]) {
      // Bare URL: don't swallow sentence punctuation stuck to the end of it.
      const stripped = url.replace(/[.,;:!?)\]]+$/, "");
      trailing = url.slice(stripped.length);
      url = stripped;
    }
    label = label ?? url;
    parts.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline hover:text-primary-dark"
      >
        {label}
      </a>
    );
    if (trailing) parts.push(trailing);
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** A file the assistant shared (CV PDF, interview recording, chart). */
function AttachmentCard({ file }: { file: AssistantAttachment }) {
  if (file.kind === "image") {
    return (
      <a href={file.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt={file.name} className="w-full bg-white" />
      </a>
    );
  }
  const Icon = file.kind === "video" ? Film : FileText;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="text-[11px] uppercase text-muted">{file.kind}</p>
      </div>
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${file.name}`}
        title="Open"
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-primary"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <a
        href={file.downloadUrl}
        aria-label={`Download ${file.name}`}
        title="Download"
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-primary"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/**
 * Collapsible right-hand chat panel for the HR assistant (LangGraph, see
 * backend/app/assistant/). Not usable until OPENAI_API_KEY is set on the
 * backend -- every send will show a clear error until then, by design.
 */
export function AssistantPanel() {
  const [collapsed, toggle] = useAssistantCollapsed();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<AssistantInterrupt | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);
  const nextId = () => String(idRef.current++);

  function addMessage(role: ChatMessage["role"], text: string, attachments?: AssistantAttachment[]) {
    setMessages((prev) => [...prev, { id: nextId(), role, text, attachments }]);
  }

  // Keep the newest message / confirmation card in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending, sending]);

  // Re-show a confirmation that was left unanswered before a reload.
  useEffect(() => {
    apiGetPendingAssistantConfirmation()
      .then((p) => p && setPending(p))
      .catch(() => {});
  }, []);

  // Release the mic if the panel unmounts mid-recording.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  /**
   * Mic button: record with MediaRecorder (works in every current browser),
   * send the clip to the backend for OpenAI transcription, and drop the text
   * into the input box -- NOT auto-sent, so a misheard word can be fixed first.
   */
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      addMessage("error", "This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      addMessage("error", "Microphone access was blocked. Allow it in the browser to use voice.");
      return;
    }
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) return;
      setTranscribing(true);
      try {
        const text = await apiTranscribeAudio(blob);
        if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
        else addMessage("error", "Couldn't make out any speech -- try again.");
      } catch (err) {
        addMessage("error", err instanceof ApiError ? err.message : "Transcription failed.");
      } finally {
        setTranscribing(false);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    addMessage("user", text);
    setSending(true);
    try {
      const result = await apiSendAssistantMessage(text);
      if (result.interrupt) {
        setPending(result.interrupt);
      } else {
        addMessage("assistant", result.reply || "", result.attachments);
      }
    } catch (err) {
      addMessage("error", err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  async function handleResume(decision: "confirm" | "reject") {
    if (!pending) return;
    setSending(true);
    const interruptCopy = pending;
    setPending(null);
    try {
      const result = await apiResumeAssistant(decision, decision === "reject" ? note : undefined);
      setNote("");
      if (result.interrupt) {
        setPending(result.interrupt);
      } else {
        addMessage("assistant", result.reply || "", result.attachments);
      }
    } catch (err) {
      setPending(interruptCopy);
      addMessage("error", err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      className={`relative hidden shrink-0 border-l border-border bg-white transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start ${
        collapsed ? "lg:w-14" : "lg:w-96"
      }`}
    >
      <button
        onClick={toggle}
        aria-label={collapsed ? "Open HR assistant" : "Collapse HR assistant"}
        title={collapsed ? "Open HR assistant" : "Collapse HR assistant"}
        className="absolute -left-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white text-gray-500 shadow-sm transition-colors hover:text-primary cursor-pointer"
      >
        {collapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
      </button>

      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-3 py-6">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-5">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">HR Assistant</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="text-xs text-muted">
                Ask about your jobs, applicants, or interviews -- e.g. &quot;how many
                applicants do I have to interview?&quot; or &quot;am I free Wednesday?&quot;
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-6 bg-primary-soft text-foreground"
                    : m.role === "error"
                      ? "bg-danger-soft text-danger"
                      : "mr-6 bg-gray-50 text-foreground"
                }`}
              >
                {m.text && (
                  <p className="whitespace-pre-wrap break-words">
                    <LinkedText text={m.text} />
                  </p>
                )}
                {m.attachments && m.attachments.length > 0 && (
                  <div className={`space-y-2 ${m.text ? "mt-2" : ""}`}>
                    {m.attachments.map((f, i) => (
                      <AttachmentCard key={`${f.url}-${i}`} file={f} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {pending && (
              <div className="mr-6 space-y-2 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2.5 text-sm">
                <p className="font-medium text-foreground">{interruptTitle(pending)}?</p>
                <ul className="space-y-1 text-xs text-foreground">
                  {interruptItems(pending).map((item, i) => (
                    <li key={i} className="rounded-md bg-white/70 px-2 py-1">
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResume("confirm")}
                    disabled={sending}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60 cursor-pointer"
                  >
                    {interruptItems(pending).length > 1 ? "Confirm all" : "Confirm"}
                  </button>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Or say what to change, then press Enter"
                  className="w-full rounded-md border border-border px-2 py-1 text-xs outline-none focus:border-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleResume("reject");
                  }}
                />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={recording ? "Listening..." : transcribing ? "Transcribing..." : "Ask the assistant..."}
              disabled={sending || !!pending}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50"
            />
            <button
              onClick={toggleRecording}
              disabled={sending || !!pending || transcribing}
              aria-label={recording ? "Stop recording" : "Speak to the assistant"}
              title={recording ? "Stop recording" : "Speak to the assistant"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                recording
                  ? "animate-pulse border-danger bg-danger-soft text-danger"
                  : "border-border text-gray-500 hover:text-primary"
              }`}
            >
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !!pending || recording || transcribing || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
