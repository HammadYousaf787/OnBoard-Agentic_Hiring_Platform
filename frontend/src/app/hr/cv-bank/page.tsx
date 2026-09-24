"use client";

import { useMemo, useState } from "react";
import { Archive, Mail, MapPin, Phone, Trash2 } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { DemoTag } from "@/components/ui/DemoTag";
import { CvViewer } from "@/components/shared/CvViewer";
import { formatDate } from "@/lib/datetime";
import { CvBankEntry } from "@/lib/types";

export default function CvBankPage() {
  const { cvBank, removeCvBankEntry, getCvBankEntryCvUrl } = useAppData();
  const [viewing, setViewing] = useState<CvBankEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CvBankEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const sorted = useMemo(
    () => [...cvBank].sort((a, b) => new Date(b.rejectedAt).getTime() - new Date(a.rejectedAt).getTime()),
    [cvBank]
  );

  return (
    <div>
      <PageHeader
        title="CV Bank"
        subtitle={
          <span>
            <DemoTag /> Candidates saved from rejected applications for future opportunities
          </span>
        }
      />

      <Card>
        <CardBody className="p-0">
          {sorted.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="CV bank is empty"
              description="Candidates you save when rejecting an application will appear here."
            />
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {sorted.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <button
                      onClick={() => setViewing(entry)}
                      className="text-sm font-medium text-foreground hover:text-primary cursor-pointer"
                    >
                      {entry.name}
                    </button>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {entry.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {entry.phone}
                      </span>
                      {(entry.city || entry.country) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[entry.city, entry.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      From <span className="font-medium text-foreground">{entry.sourceJobTitle}</span> ·
                      Rejected {formatDate(entry.rejectedAt)} by {entry.rejectedByName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" onClick={() => setViewing(entry)}>
                      View CV
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ""}
        subtitle={viewing?.cvFileName}
        width="lg"
      >
        {viewing && (
          <div className="space-y-4">
            <CvViewer
              fileName={viewing.cvFileName}
              summary={viewing.cvSummary}
              loadUrl={(inline) => getCvBankEntryCvUrl(viewing.id, inline)}
            />
            <div className="grid grid-cols-2 gap-3 text-xs text-muted">
              <span>{viewing.experienceYears} years of experience</span>
              <span>Applied for {viewing.sourceJobTitle}</span>
            </div>
            {viewing.note && (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-muted">
                <span className="font-medium text-foreground">Note: </span>
                {viewing.note}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteLoading(true);
          const result = await removeCvBankEntry(deleteTarget.id);
          setDeleteLoading(false);
          if (!result.success) {
            setDeleteError(result.error ?? "Something went wrong.");
            return;
          }
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        title="Remove from CV bank"
        description={`${deleteTarget?.name} will be permanently removed from the CV bank.`}
        confirmLabel="Remove"
        danger
        loading={deleteLoading}
        error={deleteError}
      />
    </div>
  );
}
