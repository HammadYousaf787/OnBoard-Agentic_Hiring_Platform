"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "onboardhq.sidebar.collapsed";
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
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembered (per browser) collapsed state of the desktop sidebar. */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);
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
