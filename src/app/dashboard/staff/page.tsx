"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import type { StaffDto } from "@/lib/types";
import Dialog from "@/components/dashboard/dialog";
import {
  DaysOffEditor,
  WeeklyHoursEditor,
  normalizeWeeklyHours,
  type DaysOff,
  type WeeklyHours,
} from "@/components/staff/hours-editor";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function summarizeHours(hours: WeeklyHours): string {
  const active = normalizeWeeklyHours(hours).filter((day) => day.ranges.length > 0);
  if (active.length === 0) return "No hours set";
  const names = active.map((day) => WEEKDAY_NAMES[day.weekday]).join(", ");
  return active.length === 7 ? "Open every day" : names;
}

function InviteForm({
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  onSubmit: (values: { name: string; email: string }) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, email });
      }}
      className="space-y-4"
    >
      <p className="text-sm text-slate-400">
        We&apos;ll create a staff account and email them a temporary password.
      </p>
      <label className="block text-sm text-slate-300">
        Full name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="block text-sm text-slate-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

function HoursForm({
  member,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  member: StaffDto;
  onSubmit: (values: { weeklyHours: WeeklyHours; daysOff: DaysOff }) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>(member.weeklyHours);
  const [daysOff, setDaysOff] = useState<DaysOff>(
    member.daysOff.map((entry) => ({
      date: entry.date,
      reason: entry.reason ?? undefined,
      hoursOverride: entry.hoursOverride ?? undefined,
    }))
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ weeklyHours, daysOff });
      }}
      className="space-y-5"
    >
      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-200">Weekly hours</h4>
        <WeeklyHoursEditor value={weeklyHours} onChange={setWeeklyHours} />
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-200">Days off & holidays</h4>
        <DaysOffEditor value={daysOff} onChange={setDaysOff} />
      </section>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save hours"}
        </button>
      </div>
    </form>
  );
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [hoursFor, setHoursFor] = useState<StaffDto | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch<StaffDto[]>("/api/staff"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff"] });

  const inviteMutation = useMutation({
    mutationFn: (values: { name: string; email: string }) =>
      apiFetch<{ staff: StaffDto; emailStubbed: boolean }>("/api/staff/invite", {
        method: "POST",
        body: values,
      }),
    onSuccess: () => {
      setInviteOpen(false);
      setInviteError(null);
      invalidate();
    },
    onError: (error) => setInviteError(error.message),
  });

  const hoursMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: { weeklyHours: WeeklyHours; daysOff: DaysOff };
    }) => apiFetch<StaffDto>(`/api/staff/${id}`, { method: "PATCH", body: values }),
    onSuccess: () => {
      setHoursFor(null);
      setHoursError(null);
      invalidate();
    },
    onError: (error) => setHoursError(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deactivated: boolean }>(`/api/staff/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const staff = staffQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Staff</h2>
          <p className="mt-1 text-sm text-slate-400">
            Your team roster — hours, days off, and invitations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setInviteError(null);
            setInviteOpen(true);
          }}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          + Invite staff
        </button>
      </div>

      {staffQuery.isLoading ? (
        <p className="text-slate-400">Loading staff…</p>
      ) : staffQuery.isError ? (
        <p className="text-rose-400">{staffQuery.error.message}</p>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">No team members yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Invite your first staff member to assign them to services.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {staff.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
                  {member.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-50">
                    {member.name}{" "}
                    {!member.isActive ? (
                      <span className="ml-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
                        Deactivated
                      </span>
                    ) : null}
                  </p>
                  {member.email ? (
                    <p className="text-xs text-slate-400">{member.email}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {summarizeHours(member.weeklyHours)}
                    {member.daysOff.length > 0
                      ? ` · ${member.daysOff.length} day${member.daysOff.length > 1 ? "s" : ""} off`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHoursError(null);
                    setHoursFor(member);
                  }}
                  className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Hours & time off
                </button>
                {member.isActive ? (
                  <button
                    type="button"
                    onClick={() => deactivateMutation.mutate(member.id)}
                    disabled={deactivateMutation.isPending}
                    className="rounded-xl px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={inviteOpen}
        title="Invite staff member"
        onClose={() => setInviteOpen(false)}
      >
        <InviteForm
          pending={inviteMutation.isPending}
          error={inviteError}
          onCancel={() => setInviteOpen(false)}
          onSubmit={(values) => inviteMutation.mutate(values)}
        />
      </Dialog>

      <Dialog
        open={hoursFor !== null}
        wide
        title={hoursFor ? `${hoursFor.name} — hours & time off` : "Hours"}
        onClose={() => setHoursFor(null)}
      >
        {hoursFor ? (
          <HoursForm
            member={hoursFor}
            pending={hoursMutation.isPending}
            error={hoursError}
            onCancel={() => setHoursFor(null)}
            onSubmit={(values) => hoursMutation.mutate({ id: hoursFor.id, values })}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
