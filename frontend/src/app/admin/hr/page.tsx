"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Plus, RotateCcw, Trash2, UserX } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AddHrModal } from "./AddHrModal";
import { UserAccount } from "@/lib/types";

export default function HrPanelPage() {
  const { users, jobs, removeHr, reinstateHr } = useAppData();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserAccount | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<UserAccount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const hrAccounts = useMemo(
    () =>
      users
        .filter((u) => u.role === "hr" && (u.status === "approved" || u.status === "removed"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  function jobCountFor(hrId: string) {
    return jobs.filter((j) => j.assignedHrId === hrId).length;
  }

  return (
    <div>
      <PageHeader
        title="HR Panel"
        subtitle="Manage HR team members and see what they're recruiting for."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add HR
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {hrAccounts.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="No HR accounts yet"
              description="Add your first HR team member to start assigning jobs."
              action={
                <Button onClick={() => setAddOpen(true)} size="sm">
                  <Plus className="h-4 w-4" />
                  Add HR
                </Button>
              }
            />
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">HR Member</th>
                    <th className="px-5 py-3 font-medium">Contact</th>
                    <th className="px-5 py-3 font-medium">Assigned jobs</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Added on</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hrAccounts.map((hr) => (
                    <tr key={hr.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/hr/${hr.id}`} className="group flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {hr.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <p className="font-medium text-foreground group-hover:text-primary">
                              {hr.name}
                            </p>
                            <p className="text-xs text-muted">{hr.title ?? "HR"}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted">
                          <Mail className="h-3.5 w-3.5" /> {hr.email}
                        </div>
                        {hr.phone && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                            <Phone className="h-3.5 w-3.5" /> {hr.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-foreground">
                        {jobCountFor(hr.id)}
                      </td>
                      <td className="px-5 py-3.5">
                        {hr.status === "approved" ? (
                          <Badge tone="green" dot>
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="gray" dot>
                            Removed
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted">
                        {new Date(hr.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-2">
                          {hr.status === "approved" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger-soft"
                              onClick={() => setRemoveTarget(hr)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:bg-primary-soft"
                              onClick={() => setReinstateTarget(hr)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reinstate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <AddHrModal open={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => {
          setRemoveTarget(null);
          setActionError(null);
        }}
        onConfirm={async () => {
          if (!removeTarget) return;
          setActionLoading(true);
          const result = await removeHr(removeTarget.id);
          setActionLoading(false);
          if (!result.success) {
            setActionError(result.error ?? "Something went wrong.");
            return;
          }
          setRemoveTarget(null);
          setActionError(null);
        }}
        title="Remove HR account"
        description={`${removeTarget?.name} will lose access to the platform and any jobs assigned to them will become unassigned. You can reinstate this account later.`}
        confirmLabel="Remove HR"
        danger
        loading={actionLoading}
        error={actionError}
      />

      <ConfirmDialog
        open={!!reinstateTarget}
        onClose={() => {
          setReinstateTarget(null);
          setActionError(null);
        }}
        onConfirm={async () => {
          if (!reinstateTarget) return;
          setActionLoading(true);
          const result = await reinstateHr(reinstateTarget.id);
          setActionLoading(false);
          if (!result.success) {
            setActionError(result.error ?? "Something went wrong.");
            return;
          }
          setReinstateTarget(null);
          setActionError(null);
        }}
        title="Reinstate HR account"
        description={`${reinstateTarget?.name} will regain access to the platform.`}
        confirmLabel="Reinstate"
        loading={actionLoading}
        error={actionError}
      />
    </div>
  );
}
