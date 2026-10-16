"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import type { StaffDto } from "@/lib/types";
import {
  DaysOffEditor,
  WeeklyHoursEditor,
  type DaysOff,
  type WeeklyHours,
} from "@/components/staff/hours-editor";

/** Staff self-service editor: edits weekly hours and days off on the caller's own profile. */
export default function AvailabilityEditor({ staffId }: { staffId: string }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["staff", staffId],
    queryFn: () => apiFetch<StaffDto>(`/api/staff/${staffId}`),
  });

  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours | null>(null);
  const [daysOff, setDaysOff] = useState<DaysOff | null>(null);

  const saveMutation = useMutation({
    mutationFn: (values: { weeklyHours: WeeklyHours; daysOff: DaysOff }) =>
      apiFetch<StaffDto>(`/api/staff/${staffId}`, { method: "PATCH", body: values }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["staff", staffId] });
    },
  });

  if (profileQuery.isLoading) {
    return <p className="text-slate-400">Loading your availability…</p>;
  }

  if (profileQuery.isError) {
    return <p className="text-rose-400">{profileQuery.error.message}</p>;
  }

  const profile = profileQuery.data;
  if (!profile) return null;

  const hours = weeklyHours ?? profile.weeklyHours;
  const off =
    daysOff ??
    profile.daysOff.map((entry) => ({
      date: entry.date,
      reason: entry.reason ?? undefined,
      hoursOverride: entry.hoursOverride ?? undefined,
    }));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-50">My availability</h2>
        <p className="mt-1 text-sm text-slate-400">
          Set when you can work and request time off.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          saveMutation.mutate({ weeklyHours: hours, daysOff: off });
        }}
        className="space-y-6"
      >
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Weekly hours
          </h3>
          <WeeklyHoursEditor
            value={hours}
            onChange={(next) => {
              setSaved(false);
              setWeeklyHours(next);
            }}
          />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Days off
          </h3>
          <DaysOffEditor
            value={off}
            onChange={(next) => {
              setSaved(false);
              setDaysOff(next);
            }}
          />
        </section>

        {saveMutation.isError ? (
          <p className="text-sm text-rose-400">{saveMutation.error.message}</p>
        ) : null}
        {saved && !saveMutation.isPending ? (
          <p className="text-sm text-emerald-400">Availability saved.</p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : "Save availability"}
          </button>
        </div>
      </form>
    </div>
  );
}
