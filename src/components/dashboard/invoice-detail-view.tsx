"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { formatDateTimeClient } from "@/lib/wizard-dates";
import type { BusinessDto, InvoiceDto, InvoiceLineItem } from "@/lib/types";
import InvoiceStatusBadge from "@/components/invoice/status-badge";

type EditableItem = { description: string; qty: number; unitPrice: number };

/**
 * Invoice detail + actions (P6-T8). Mounted only once the invoice is loaded,
 * and keyed by id + status so a status change resets the draft editor without
 * an effect.
 */
function InvoiceDetail({
  invoice,
  currency,
  timezone,
}: {
  invoice: InvoiceDto;
  currency: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<EditableItem[]>(() =>
    invoice.lineItems.map((item) => ({ ...item }))
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const editable = invoice.status === "draft";
  const rows = editable ? items : invoice.lineItems;
  const invoiceId = invoice.id;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  const saveMutation = useMutation({
    mutationFn: (lineItems: InvoiceLineItem[]) =>
      apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        body: { lineItems },
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}/send`, {
        method: "POST",
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: () =>
      apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        body: { status: "void" },
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  const busy =
    saveMutation.isPending || sendMutation.isPending || voidMutation.isPending;

  function updateRow(index: number, patch: Partial<EditableItem>) {
    setItems((current) => {
      const base = current.map((item) => ({ ...item }));
      base[index] = { ...base[index], ...patch };
      return base;
    });
  }

  return (
    <div>
      <Link
        href="/dashboard/invoices"
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Invoices
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">{invoice.number}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {invoice.customer?.name ?? "Customer"}
            {invoice.customer?.email ? ` · ${invoice.customer.email}` : ""}
          </p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Line items
              </h3>
              {editable ? (
                <button
                  type="button"
                  onClick={() =>
                    setItems([
                      ...rows,
                      { description: "", qty: 1, unitPrice: 0 },
                    ])
                  }
                  className="text-xs text-emerald-400 hover:underline"
                >
                  + Add item
                </button>
              ) : null}
            </div>

            <div className="mt-3 space-y-3">
              {rows.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 items-center gap-2 text-sm"
                >
                  {editable ? (
                    <>
                      <input
                        value={item.description}
                        onChange={(event) =>
                          updateRow(index, { description: event.target.value })
                        }
                        placeholder="Description"
                        className="col-span-6 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(event) =>
                          updateRow(index, {
                            qty: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                        className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice / 100}
                        onChange={(event) =>
                          updateRow(index, {
                            unitPrice: Math.max(
                              0,
                              Math.round((Number(event.target.value) || 0) * 100)
                            ),
                          })
                        }
                        className="col-span-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems(
                            rows.filter((_, position) => position !== index)
                          )
                        }
                        className="col-span-1 text-rose-400 hover:underline"
                        aria-label="Remove item"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="col-span-6 text-slate-100">
                        {item.description}
                      </span>
                      <span className="col-span-2 text-right text-slate-400">
                        {item.qty}
                      </span>
                      <span className="col-span-4 text-right text-slate-200">
                        {formatMoney(item.qty * item.unitPrice, currency)}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {!editable ? (
              <dl className="mt-5 space-y-1 border-t border-slate-800 pt-4 text-sm">
                <div className="flex justify-between text-slate-400">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(invoice.subtotal, currency)}</dd>
                </div>
                {invoice.tax > 0 ? (
                  <div className="flex justify-between text-slate-400">
                    <dt>Tax</dt>
                    <dd>{formatMoney(invoice.tax, currency)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between pt-2 text-base font-semibold text-slate-50">
                  <dt>Total</dt>
                  <dd>{formatMoney(invoice.total, currency)}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Actions
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {editable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    saveMutation.mutate(
                      rows.map((item) => ({
                        description: item.description.trim(),
                        qty: item.qty,
                        unitPrice: item.unitPrice,
                      }))
                    )
                  }
                  className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {saveMutation.isPending ? "Saving…" : "Save draft"}
                </button>
              ) : null}

              {invoice.status === "draft" || invoice.status === "sent" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sendMutation.mutate()}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
                >
                  {invoice.status === "draft"
                    ? "Send invoice"
                    : "Resend invoice"}
                </button>
              ) : null}

              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                className="rounded-xl border border-slate-700 px-3 py-2 text-center text-sm text-slate-100 hover:bg-slate-800"
              >
                Download PDF
              </a>

              {invoice.status === "draft" || invoice.status === "sent" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Void this invoice?")) {
                      voidMutation.mutate();
                    }
                  }}
                  className="rounded-xl border border-rose-500/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  Void invoice
                </button>
              ) : null}

              {actionError ? (
                <p className="text-sm text-rose-400">{actionError}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Details
            </h3>
            <dl className="mt-3 space-y-2 text-slate-200">
              <div className="flex justify-between">
                <dt className="text-slate-400">Issued</dt>
                <dd>
                  {formatDateTimeClient(
                    invoice.createdAt ?? new Date().toISOString(),
                    timezone
                  )}
                </dd>
              </div>
              {invoice.paidAt ? (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Paid</dt>
                  <dd>{formatDateTimeClient(invoice.paidAt, timezone)}</dd>
                </div>
              ) : null}
              {invoice.booking ? (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Booking</dt>
                  <dd>
                    <Link
                      href={`/dashboard/bookings/${invoice.booking.id}`}
                      className="text-emerald-400 hover:underline"
                    >
                      View
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`),
  });

  if (invoiceQuery.isLoading) {
    return <p className="text-slate-400">Loading invoice…</p>;
  }
  if (invoiceQuery.isError || !invoiceQuery.data) {
    return (
      <div>
        <p className="text-rose-400">
          {invoiceQuery.error?.message ?? "Invoice not found."}
        </p>
        <Link
          href="/dashboard/invoices"
          className="mt-4 inline-block text-sm text-emerald-400 hover:underline"
        >
          ← Back to invoices
        </Link>
      </div>
    );
  }

  const invoice = invoiceQuery.data;

  return (
    <InvoiceDetail
      key={`${invoice.id}-${invoice.status}`}
      invoice={invoice}
      currency={businessQuery.data?.currency ?? "BDT"}
      timezone={businessQuery.data?.timezone ?? "UTC"}
    />
  );
}
