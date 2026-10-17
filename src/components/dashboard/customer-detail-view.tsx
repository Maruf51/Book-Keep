"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import {
  formatDayLabelClient,
  formatTimeClient,
} from "@/lib/wizard-dates";
import type { BusinessDto, CustomerDetailDto } from "@/lib/types";
import StatusBadge from "@/components/dashboard/status-badge";

export default function CustomerDetailView({
  customerId,
}: {
  customerId: string;
}) {
  const queryClient = useQueryClient();
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const customerQuery = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => apiFetch<CustomerDetailDto>(`/api/customers/${customerId}`),
  });
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });

  const customer = customerQuery.data;
  const timezone = businessQuery.data?.timezone ?? "UTC";
  const currency = businessQuery.data?.currency ?? "BDT";
  const notes = notesDraft ?? customer?.notes ?? "";

  const notesMutation = useMutation({
    mutationFn: () =>
      apiFetch<CustomerDetailDto>(`/api/customers/${customerId}`, {
        method: "PATCH",
        body: { notes },
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  if (customerQuery.isLoading) {
    return <p className="text-slate-400">Loading customer…</p>;
  }
  if (customerQuery.isError || !customer) {
    return (
      <p className="text-rose-400">
        {customerQuery.error?.message ?? "Customer not found."}
      </p>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard/customers"
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Customers
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">{customer.name}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {customer.email ?? "No email"} · {customer.phone ?? "No phone"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950 px-5 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total spent
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            {formatMoney(customer.totalSpent, currency)}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Notes
        </h3>
        <textarea
          value={notes}
          onChange={(event) => setNotesDraft(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => notesMutation.mutate()}
            disabled={notesMutation.isPending || notes === (customer.notes ?? "")}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {notesMutation.isPending ? "Saving…" : "Save notes"}
          </button>
          {saved ? <span className="text-sm text-emerald-400">Saved</span> : null}
          {notesMutation.isError ? (
            <span className="text-sm text-rose-400">
              {notesMutation.error.message}
            </span>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Booking history
        </h3>
        {customer.bookings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            No bookings yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {customer.bookings.map((booking) => (
                  <tr key={booking.id} className="text-slate-200">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                      {formatDayLabelClient(booking.startAt, timezone)} ·{" "}
                      {formatTimeClient(booking.startAt, timezone)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
                        className="text-slate-50 hover:underline"
                      >
                        {booking.service?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {booking.staff?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(booking.price, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
