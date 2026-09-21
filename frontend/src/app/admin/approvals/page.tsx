"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Mail, ShieldCheck, X } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { FieldGroup, Textarea } from "@/components/ui/Field";
import { UserAccount } from "@/lib/types";

export default function ApprovalsPage() {
  const { users, approveUser, rejectUser } = useAppData();
  const [rejectTarget, setRejectTarget] = useState<UserAccount | null>(null);
  const [reason, setReason] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const pending = useMemo(
    () =>
      users
        .filter((u) => u.status === "pending")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [users]
  );

  const recentDecisions = useMemo(
    () =>
      users
        .flatMap((u) =>
          u.approvalHistory
            .filter((e) => e.action === "approved" || e.action === "rejected")
            .map((e) => ({ ...e, userName: u.name, userRole: u.role }))
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8),
    [users]
  );

  async function handleApprove(userId: string) {
    setApprovingId(userId);
    setListError(null);
    const result = await approveUser(userId);
    setApprovingId(null);
    if (!result.success) {
      setListError(result.error ?? "Something went wrong.");
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    setRejectError(null);
    const result = await rejectUser(rejectTarget.id, reason.trim() || undefined);
    setRejectSubmitting(false);
    if (!result.success) {
      setRejectError(result.error ?? "Something went wrong.");
      return;
    }
    setRejectTarget(null);
    setReason("");
  }

  return (
    <div>
      <PageHeader
        title="Account Approvals"
        subtitle="Review signup requests before granting platform access."
      />

      <Card>
        <CardHeader
          title={`Pending requests (${pending.length})`}
          subtitle="New admin and HR accounts waiting for a decision"
        />
        <CardBody className="p-0">
          {listError && (
            <div className="border-b border-border bg-danger-soft px-5 py-3 text-sm text-danger">
              {listError}
            </div>
          )}
          {pending.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="All caught up"
              description="There are no pending account requests right now."
            />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-sm font-semibold text-warning">
                      {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <Badge tone={user.role === "admin" ? "indigo" : "blue"}>
                          {user.role === "admin" ? "Admin request" : "HR request"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                        <Mail className="h-3.5 w-3.5" /> {user.email}
                        {user.title && <span> · {user.title}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Requested{" "}
                        {new Date(user.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border-danger/30 text-danger hover:bg-danger-soft"
                      onClick={() => setRejectTarget(user)}
                      disabled={approvingId === user.id}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(user.id)}
                      loading={approvingId === user.id}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent decisions" subtitle="Latest approvals and rejections" />
        <CardBody className="p-0">
          {recentDecisions.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No decisions recorded yet" />
          ) : (
            <ul className="divide-y divide-border">
              {recentDecisions.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {event.userName}{" "}
                      <span className="font-normal text-muted">
                        ({event.userRole === "admin" ? "Admin" : "HR"})
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      by {event.byUserName} ·{" "}
                      {new Date(event.date).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {event.note && <span> · &ldquo;{event.note}&rdquo;</span>}
                    </p>
                  </div>
                  <Badge tone={event.action === "approved" ? "green" : "red"}>
                    {event.action === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setReason("");
          setRejectError(null);
        }}
        title={`Reject ${rejectTarget?.name}'s request`}
        width="sm"
      >
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>They won&apos;t be able to log in with this account until reinstated.</span>
        </div>
        <FieldGroup label="Reason (optional)" htmlFor="reject-reason">
          <Textarea
            id="reject-reason"
            rows={3}
            placeholder="Let them know why this request was rejected..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FieldGroup>
        {rejectError && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{rejectError}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setRejectTarget(null);
              setReason("");
              setRejectError(null);
            }}
            disabled={rejectSubmitting}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReject} loading={rejectSubmitting}>
            Reject request
          </Button>
        </div>
      </Modal>
    </div>
  );
}
