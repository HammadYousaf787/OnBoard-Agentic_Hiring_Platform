"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "onboardhq.assistant.collapsed";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot() {
  try {
    // Collapsed by default -- the assistant isn't usable until an OpenAI key
    // is configured, so it shouldn't claim screen space unasked.
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

/** Remembered (per browser) collapsed state of the right-hand assistant panel. */
export function useAssistantCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => true);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, collapsed ? "0" : "1");
    } catch {
      // storage unavailable; state just won't persist
    }
    listeners.forEach((l) => l());
  }, [collapsed]);
  return [collapsed, toggle] as const;
}
