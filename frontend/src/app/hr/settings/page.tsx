"use client";

import { useState } from "react";
import { Archive, AtSign, Mail, User } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DemoTag } from "@/components/ui/DemoTag";

export default function HrSettingsPage() {
  const { currentUser, updateHrSettings } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    setSaving(true);
    setError(null);
    const result = await updateHrSettings({ autoSaveCvBankOnReject: checked });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile and recruitment preferences." />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <User className="h-4 w-4 text-gray-400" /> {currentUser?.name}
              <span className="text-muted">· {currentUser?.title ?? "HR"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Mail className="h-4 w-4 text-gray-400" /> {currentUser?.email}
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <AtSign className="h-4 w-4 text-gray-400" /> {currentUser?.username}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recruitment preferences"
            subtitle="Control what happens automatically during your hiring workflow"
          />
          <CardBody>
            <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={!!currentUser?.autoSaveCvBankOnReject}
                disabled={saving}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Archive className="h-4 w-4 text-gray-400" />
                  Auto-save to CV bank on rejection
                </span>
                <span className="mt-1 block text-xs text-muted">
                  <DemoTag /> When enabled, a candidate&apos;s info is automatically saved to the
                  CV bank whenever you reject their application — no confirmation needed.
                </span>
              </span>
            </label>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
