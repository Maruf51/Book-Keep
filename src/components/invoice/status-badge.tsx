import type { InvoiceStatus } from "@/lib/types";

const STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-600/30 text-slate-300",
  sent: "bg-amber-500/15 text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  void: "bg-rose-500/15 text-rose-300",
};

const LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export default function InvoiceStatusBadge({
  status,
}: {
  status: InvoiceStatus;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STYLES[status] ?? "bg-slate-700/40 text-slate-300"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
