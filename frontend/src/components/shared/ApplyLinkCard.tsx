"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Job } from "@/lib/types";

const APPLY_PORTAL_URL = (
  process.env.NEXT_PUBLIC_APPLY_PORTAL_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");

export function ApplyLinkCard({ job }: { job: Job }) {
  const [copied, setCopied] = useState(false);
  const link = `${APPLY_PORTAL_URL}/apply/${job.id}`;
  const accepting = job.status === "open" && job.filledSeats < job.seats;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) -- the link is still selectable below.
    }
  }

  return (
    <Card>
      <CardHeader
        title="Application form"
        subtitle="Public link applicants use to apply for this role"
      />
      <CardBody className="space-y-3">
        <p className="break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-foreground select-all">
          {link}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a href={link} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="secondary" type="button">
              <ExternalLink className="h-3.5 w-3.5" />
              Preview form
            </Button>
          </a>
        </div>
        <p className="text-xs text-muted">
          Technical role (GitHub field + coding assessment): {job.collectGithub ? "yes" : "no"} (change via Edit).
        </p>
        <p className="text-xs text-muted">
          {accepting
            ? "The form is live. Title, department, location and description come from this job."
            : "This job is closed or full, so the form will show “Applications closed”."}
        </p>
      </CardBody>
    </Card>
  );
}
