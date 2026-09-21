"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Video } from "lucide-react";
import { Appointment } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/datetime";

function statusBadge(a: Appointment) {
  if (a.roomStatus === "ended") return <Badge tone="gray">Completed</Badge>;
  if (a.roomStatus === "live") return <Badge tone="green">Live</Badge>;
  return <Badge tone="blue">Upcoming</Badge>;
}

/**
 * Dropdown listing every interview for a candidate ("Interview 2 · <time>");
 * each entry opens that interview's record.
 */
export function InterviewsMenu({
  appointments,
  recordBasePath,
}: {
  appointments: Appointment[];
  recordBasePath: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-gray-50 cursor-pointer"
      >
        <Video className="h-4 w-4 text-muted" />
        Interviews ({appointments.length})
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          {appointments.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-muted">No interviews yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {appointments.map((a, i) => (
                <li key={a.id}>
                  <Link
                    role="menuitem"
                    href={`${recordBasePath}/${a.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        Interview {i + 1}
                      </span>
                      <span className="block truncate text-xs text-muted">{formatDateTime(a.dateTime)}</span>
                    </span>
                    {statusBadge(a)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
