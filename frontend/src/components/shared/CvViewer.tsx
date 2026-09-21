"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const PREVIEWABLE = [".pdf", ".txt"];

/**
 * Renders a stored CV. Fetches a short-lived presigned URL from the object
 * store when mounted (mount it only while visible, e.g. inside an open
 * Modal); PDFs and .txt files preview inline, other formats offer download.
 */
export function CvViewer({
  fileName,
  summary,
  loadUrl,
}: {
  fileName: string;
  summary?: string;
  loadUrl: (inline: boolean) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const loadRef = useRef(loadUrl);

  useEffect(() => {
    let cancelled = false;
    loadRef.current(true).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const previewable = PREVIEWABLE.includes(extension);

  async function download() {
    setBusy(true);
    const downloadUrl = await loadRef.current(false);
    setBusy(false);
    if (downloadUrl) window.open(downloadUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {url === undefined ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading CV…
        </div>
      ) : url === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-10 text-sm text-muted">
          <FileText className="h-4 w-4" /> No CV file is stored for this candidate.
        </div>
      ) : previewable ? (
        <iframe
          src={url}
          title={fileName}
          className="h-[60vh] w-full rounded-lg border border-border bg-white"
        />
      ) : (
        <div className="rounded-lg border border-border bg-gray-50 px-4 py-6 text-center text-sm text-muted">
          A preview isn&apos;t available for {extension || "this"} files — download the original
          instead.
        </div>
      )}

      {url && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </Button>
          <Button size="sm" onClick={download} loading={busy}>
            <Download className="h-3.5 w-3.5" />
            Download original file
          </Button>
        </div>
      )}

      {summary && (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Extracted text (used for AI review)
          </summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-foreground">
            {summary}
          </p>
        </details>
      )}
    </div>
  );
}
