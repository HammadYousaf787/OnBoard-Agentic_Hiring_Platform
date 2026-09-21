"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Textarea } from "./Field";

/** Textarea that saves itself ~1s after the user stops typing. */
export function AutosaveTextarea({
  initial,
  onSave,
  label,
  placeholder,
  rows = 6,
  disabled,
}: {
  initial: string;
  onSave: (text: string) => Promise<void>;
  label: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  const saveRef = useRef(onSave);
  useEffect(() => {
    latest.current = value;
    saveRef.current = onSave;
  });

  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await saveRef.current(latest.current);
        dirty.current = false;
        setState("saved");
      } catch {
        setState("error");
      }
    }, 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <span className="text-xs text-muted">
          {state === "saving" && "Saving…"}
          {state === "saved" && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {state === "error" && <span className="text-danger">Couldn&apos;t save</span>}
        </span>
      </div>
      <Textarea
        aria-label={label}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          dirty.current = true;
          setState("saving");
          setValue(e.target.value);
        }}
      />
    </div>
  );
}
