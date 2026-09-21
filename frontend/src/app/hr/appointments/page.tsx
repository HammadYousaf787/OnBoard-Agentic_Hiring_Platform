"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CalendarClock, CalendarDays, Check, Copy, Pencil, Trash2, Video } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DemoTag } from "@/components/ui/DemoTag";
import { AppointmentCalendar } from "@/components/hr/AppointmentCalendar";
import { RescheduleModal } from "@/components/hr/RescheduleModal";
import { formatDate, formatTime, isSameDay } from "@/lib/datetime";
import { Badge } from "@/components/ui/Badge";
import { Appointment } from "@/lib/types";
import { isUpcoming, useNow } from "@/lib/scheduling";
import { RemoveInterviewDialog } from "@/components/hr/RemoveInterviewDialog";

const APPLY_PORTAL_URL = (
  process.env.NEXT_PUBLIC_APPLY_PORTAL_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export default function AppointmentsPage() {
  const { currentUser, jobs, applicants, appointments, toggleNotifyDayBefore, setupInterviewRooms } =
    useAppData();
  const now = useNow();
  const [removeTarget, setRemoveTarget] = useState<Appointment | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingUp, setSettingUp] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggleNotify(appointmentId: string) {
    setTogglingId(appointmentId);
    setToggleError(null);
    const result = await toggleNotifyDayBefore(appointmentId);
    setTogglingId(null);
    if (!result.success) {
      setToggleError(result.error ?? "Something went wrong.");
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSetupRooms() {
    setSettingUp(true);
    setToggleError(null);
    const result = await setupInterviewRooms([...selected]);
    setSettingUp(false);
    if (!result.success) {
      setToggleError(result.error ?? "Something went wrong.");
      return;
    }
    setSelected(new Set());
  }

  async function copyApplicantLink(appt: Appointment) {
    if (!appt.roomToken) return;
    await navigator.clipboard
      .writeText(`${APPLY_PORTAL_URL}/interview/${appt.roomToken}`)
      .catch(() => {});
    setCopiedId(appt.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  const myAppointments = useMemo(
    () => appointments.filter((a) => a.hrId === currentUser?.id),
    [appointments, currentUser]
  );

  function countForDate(date: Date) {
    return myAppointments.filter((a) => isSameDay(new Date(a.dateTime), date)).length;
  }

  const agenda = useMemo(
    () =>
      myAppointments
        .filter((a) => isSameDay(new Date(a.dateTime), selectedDate))
        .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()),
    [myAppointments, selectedDate]
  );

  const upcoming = useMemo(
    () =>
      myAppointments
        .filter((a) => isUpcoming(a, now))
        .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
        .slice(0, 5),
    [myAppointments, now]
  );

  const allInterviews = useMemo(
    () =>
      [...myAppointments].sort(
        (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      ),
    [myAppointments]
  );
  const selectableIds = allInterviews.filter((a) => a.roomStatus !== "ended").map((a) => a.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function roundLabel(appt: Appointment) {
    const rounds = myAppointments
      .filter((a) => a.applicantId === appt.applicantId)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    return rounds.length > 1 ? ` · Interview ${rounds.findIndex((a) => a.id === appt.id) + 1} of ${rounds.length}` : "";
  }

  function applicantFor(id: string) {
    return applicants.find((a) => a.id === id);
  }
  function jobFor(id: string) {
    return jobs.find((j) => j.id === id);
  }

  function renderAppointmentRow(appt: Appointment, rooms = false) {
    const applicant = applicantFor(appt.applicantId);
    const job = jobFor(appt.jobId);
    return (
      <li key={appt.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        {rooms && (
        <input
          type="checkbox"
          aria-label={`Select interview with ${applicant?.name ?? "candidate"}`}
          checked={selected.has(appt.id)}
          onChange={() => toggleSelected(appt.id)}
          disabled={appt.roomStatus === "ended"}
          className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/hr/jobs/${appt.jobId}/applicants/${appt.applicantId}`}
            className="text-sm font-medium text-foreground hover:text-primary"
          >
            {applicant?.name ?? "Unknown candidate"}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            {job?.title} · {formatDate(appt.dateTime)} at {formatTime(appt.dateTime)}
            {roundLabel(appt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {rooms && appt.roomStatus !== "not_setup" && (
            <Badge
              tone={appt.roomStatus === "live" ? "green" : appt.roomStatus === "ended" ? "gray" : "blue"}
              dot
            >
              {appt.roomStatus === "live" ? "Live" : appt.roomStatus === "ended" ? "Ended" : "Room ready"}
            </Badge>
          )}
          {rooms && appt.roomToken && appt.roomStatus !== "ended" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyApplicantLink(appt)}
              title="Copy the candidate's interview link"
            >
              {copiedId === appt.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Candidate link
            </Button>
          )}
          {rooms && appt.roomStatus !== "not_setup" && (
            <Link
              href={
                appt.roomStatus === "ended"
                  ? `/hr/jobs/${appt.jobId}/applicants/${appt.applicantId}/interviews/${appt.id}`
                  : `/hr/appointments/${appt.id}/room`
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50"
            >
              <Video className="h-3.5 w-3.5" />
              {appt.roomStatus === "ended" ? "Interview record" : "Interviewer room"}
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleNotify(appt.id)}
            disabled={togglingId === appt.id}
            title={
              appt.notifyDayBefore
                ? "Reminder on — click to turn off"
                : "Turn on reminder 1 day prior"
            }
          >
            {appt.notifyDayBefore ? (
              <Bell className="h-3.5 w-3.5 text-primary" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
          </Button>
          {appt.roomStatus !== "ended" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRescheduleTarget(appt)}
              aria-label={`Reschedule interview with ${applicant?.name ?? "candidate"}`}
              title="Change time"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {appt.roomStatus !== "ended" && appt.roomStatus !== "live" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-soft"
              onClick={() => setRemoveTarget(appt)}
              aria-label={`Remove interview with ${applicant?.name ?? "candidate"}`}
              title="Remove slot"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      <PageHeader
        title="Interview Appointments"
        subtitle={
          <span>
            All scheduled interviews across your assigned jobs. <DemoTag /> reminders are
            simulated — no real notifications are sent.
          </span>
        }
      />

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft px-4 py-3">
          <span className="text-sm text-primary">
            {selected.size} interview{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSetupRooms} loading={settingUp}>
              <Video className="h-4 w-4" />
              Set up video rooms
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {toggleError && (
        <div className="mb-4 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {toggleError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <AppointmentCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            countForDate={countForDate}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title={formatDate(selectedDate.toISOString())}
              subtitle="Interviews on this day"
            />
            <CardBody className="p-0">
              {agenda.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No interviews on this day" />
              ) : (
                <ul className="divide-y divide-border">{agenda.map((a) => renderAppointmentRow(a))}</ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Upcoming" subtitle="Your next scheduled interviews" />
            <CardBody className="p-0">
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing upcoming" />
              ) : (
                <ul className="divide-y divide-border">{upcoming.map((a) => renderAppointmentRow(a))}</ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={`Lined-up interviews (${allInterviews.length})`}
          subtitle="Select interviews to set up their video rooms, then share each candidate's link"
          action={
            selectableIds.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  aria-label="Select all interviews"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
                  className="h-4 w-4 cursor-pointer accent-indigo-600"
                />
                Select all
              </label>
            )
          }
        />
        <CardBody className="p-0">
          {allInterviews.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No interviews lined up" />
          ) : (
            <ul className="divide-y divide-border">
              {allInterviews.map((appt) => renderAppointmentRow(appt, true))}
            </ul>
          )}
        </CardBody>
      </Card>

      <RemoveInterviewDialog
        appointment={removeTarget}
        candidateName={removeTarget ? applicantFor(removeTarget.applicantId)?.name ?? "the candidate" : ""}
        onClose={() => setRemoveTarget(null)}
      />

      <RescheduleModal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        subtitle={
          rescheduleTarget
            ? `${applicantFor(rescheduleTarget.applicantId)?.name ?? ""} · ${
                jobFor(rescheduleTarget.jobId)?.title ?? ""
              }`
            : undefined
        }
      />
    </div>
  );
}
