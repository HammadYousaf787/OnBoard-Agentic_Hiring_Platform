"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/**
 * Admin-only usage meter for the AI Job Review pipeline (Gemini calls).
 * Pulled from GET /ai-usage/summary, which the context re-fetches after
 * every AI review run in the current session -- other sessions' usage
 * still shows up next time this admin's data reloads (login/navigation),
 * since there's no push/websocket channel between sessions.
 */
export function AiUsageMeter() {
  const { aiUsage } = useAppData();
  const [open, setOpen] = useState(false);

  if (!aiUsage) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-border bg-primary-soft/40 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft cursor-pointer"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-foreground">AI usage</span>
          <span className="block truncate text-[11px] text-muted">
            {aiUsage.totalCalls} call{aiUsage.totalCalls !== 1 ? "s" : ""} ·{" "}
            {formatTokens(aiUsage.totalTokens)} tokens
          </span>
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="AI usage"
        subtitle="Gemini API calls made by the AI Job Review pipeline"
        width="md"
      >
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{aiUsage.totalCalls}</p>
            <p className="text-xs text-muted">Total calls</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold text-success">{aiUsage.successfulCalls}</p>
            <p className="text-xs text-muted">Successful</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold text-danger">{aiUsage.failedCalls}</p>
            <p className="text-xs text-muted">Failed</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-sm font-semibold text-foreground">
              {aiUsage.totalTokens.toLocaleString()}
            </p>
            <p className="text-xs text-muted">Total tokens</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-sm font-semibold text-foreground">
              {aiUsage.totalPromptTokens.toLocaleString()}
            </p>
            <p className="text-xs text-muted">Prompt tokens</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-sm font-semibold text-foreground">
              {aiUsage.totalCompletionTokens.toLocaleString()}
            </p>
            <p className="text-xs text-muted">Completion tokens</p>
          </div>
        </div>

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Recent calls
        </p>
        {aiUsage.recentEvents.length === 0 ? (
          <p className="text-sm text-muted">No AI calls yet.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {aiUsage.recentEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {e.purpose.replace(/_/g, " ")} · {e.modelName}
                  </p>
                  <p className="text-muted">
                    {new Date(e.createdAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {e.totalTokens ? ` · ${e.totalTokens} tokens` : ""}
                  </p>
                  {e.errorMessage && (
                    <p className="mt-0.5 truncate text-danger">{e.errorMessage}</p>
                  )}
                </div>
                <Badge tone={e.success ? "green" : "red"}>{e.success ? "OK" : "Failed"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
