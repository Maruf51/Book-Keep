"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import type { BusinessDto, InvoiceDto } from "@/lib/types";
import InvoiceStatusBadge from "@/components/invoice/status-badge";

const FILTERS = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
] as const;

export default function InvoicesView() {
  const [filter, setFilter] = useState("");

  const invoicesQuery = useQuery({
    queryKey: ["invoices", filter],
    queryFn: () =>
      apiFetch<InvoiceDto[]>(
        filter ? `/api/invoices?status=${filter}` : "/api/invoices"
      ),
  });
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });

  const invoices = invoicesQuery.data ?? [];
  const currency = businessQuery.data?.currency ?? "BDT";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-50">Invoices</h2>
        <p className="mt-1 text-sm text-slate-400">
          Create invoices from bookings and track payments.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === option.value
                ? "bg-emerald-500 font-semibold text-slate-950"
                : "border border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {invoicesQuery.isLoading ? (
        <p className="text-slate-400">Loading invoices…</p>
      ) : invoicesQuery.isError ? (
        <p className="text-rose-400">{invoicesQuery.error.message}</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">No invoices here yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Open a completed booking and choose “Create invoice”.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="text-slate-200">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="font-medium text-slate-50 hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {invoice.customer?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{formatMoney(invoice.total, currency)}</td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
