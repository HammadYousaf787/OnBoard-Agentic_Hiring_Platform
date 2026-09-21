"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, UserPlus } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { DemoTag } from "@/components/ui/DemoTag";

const emptyForm = {
  name: "",
  email: "",
  title: "",
  department: "",
  phone: "",
  password: "",
};

export function AddHrModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addHr } = useAppData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose() {
    setForm(emptyForm);
    setError(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addHr(form);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add HR member"
      subtitle="This account is created and approved immediately by you."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldGroup label="Full name" htmlFor="hr-name" required>
          <Input
            id="hr-name"
            required
            placeholder="Jane Doe"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="Email address" htmlFor="hr-email" required>
          <Input
            id="hr-email"
            type="email"
            required
            placeholder="jane.doe@company.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Job title" htmlFor="hr-title">
            <Input
              id="hr-title"
              placeholder="HR Executive"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Department" htmlFor="hr-department">
            <Input
              id="hr-department"
              placeholder="Talent Acquisition"
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Phone" htmlFor="hr-phone">
          <Input
            id="hr-phone"
            placeholder="+92 300 1234567"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup
          label="Temporary password"
          htmlFor="hr-password"
          required
          hint={
            <span>
              <DemoTag /> shared with the HR member outside the platform in a real deployment.
            </span>
          }
        >
          <Input
            id="hr-password"
            type="text"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
        </FieldGroup>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <UserPlus className="h-4 w-4" />
            Add HR member
          </Button>
        </div>
      </form>
    </Modal>
  );
}
