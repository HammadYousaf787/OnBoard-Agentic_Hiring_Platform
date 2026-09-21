"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Briefcase } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select, Textarea } from "@/components/ui/Field";
import { Job } from "@/lib/types";

const emptyForm = {
  title: "",
  department: "",
  location: "",
  description: "",
  seats: "1",
  salaryMin: "",
  salaryMax: "",
  currency: "PKR",
  status: "open" as "open" | "closed",
  collectGithub: false,
};

export function JobFormModal({
  open,
  onClose,
  job,
}: {
  open: boolean;
  onClose: () => void;
  job?: Job | null;
}) {
  const { addJob, updateJob } = useAppData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!job;

  useEffect(() => {
    if (open) {
      if (job) {
        setForm({
          title: job.title,
          department: job.department,
          location: job.location,
          description: job.description,
          seats: String(job.seats),
          salaryMin: String(job.salaryMin),
          salaryMax: String(job.salaryMax),
          currency: job.currency,
          status: job.status,
          collectGithub: job.collectGithub,
        });
      } else {
        setForm(emptyForm);
      }
      setError(null);
    }
  }, [open, job]);

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const seats = parseInt(form.seats, 10);
    const salaryMin = parseInt(form.salaryMin, 10);
    const salaryMax = parseInt(form.salaryMax, 10);

    if (!seats || seats < 1) {
      setError("Number of seats must be at least 1.");
      return;
    }
    if (!salaryMin || !salaryMax || salaryMin > salaryMax) {
      setError("Please enter a valid salary range (min ≤ max).");
      return;
    }

    setSubmitting(true);
    const payload = {
      title: form.title.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      seats,
      salaryMin,
      salaryMax,
      currency: form.currency,
      status: form.status,
      collectGithub: form.collectGithub,
      assignedHrId: job?.assignedHrId,
    };
    const result = isEdit && job ? await updateJob(job.id, payload) : await addJob(payload);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit job position" : "Post a new job"}
      subtitle={isEdit ? "Update details for this position." : "Define the role you're hiring for."}
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Job title" htmlFor="job-title" required>
            <Input
              id="job-title"
              required
              placeholder="Senior Frontend Engineer"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Department" htmlFor="job-department" required>
            <Input
              id="job-department"
              required
              placeholder="Engineering"
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Location" htmlFor="job-location" required>
          <Input
            id="job-location"
            required
            placeholder="Lahore, Pakistan (Hybrid)"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="Job description" htmlFor="job-description" required>
          <Textarea
            id="job-description"
            required
            rows={5}
            placeholder="Responsibilities, requirements, and what success looks like in this role..."
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </FieldGroup>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Number of seats" htmlFor="job-seats" required>
            <Input
              id="job-seats"
              type="number"
              min={1}
              required
              value={form.seats}
              onChange={(e) => update("seats", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Status" htmlFor="job-status">
            <Select
              id="job-status"
              value={form.status}
              onChange={(e) => update("status", e.target.value as "open" | "closed")}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FieldGroup label="Min salary" htmlFor="job-salary-min" required>
            <Input
              id="job-salary-min"
              type="number"
              min={0}
              required
              placeholder="200000"
              value={form.salaryMin}
              onChange={(e) => update("salaryMin", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Max salary" htmlFor="job-salary-max" required>
            <Input
              id="job-salary-max"
              type="number"
              min={0}
              required
              placeholder="300000"
              value={form.salaryMax}
              onChange={(e) => update("salaryMax", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Currency" htmlFor="job-currency">
            <Select
              id="job-currency"
              value={form.currency}
              onChange={(e) => update("currency", e.target.value)}
            >
              <option value="PKR">PKR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          </FieldGroup>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-gray-50">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            checked={form.collectGithub}
            onChange={(e) => update("collectGithub", e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Technical role
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Adds an optional GitHub field to the public application form and lets HR
              forward applicants to a coding assessment before the interview.
            </span>
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <Briefcase className="h-4 w-4" />
            {isEdit ? "Save changes" : "Post job"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
