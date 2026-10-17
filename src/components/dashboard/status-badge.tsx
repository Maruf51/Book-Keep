import type { BookingStatus } from "@/lib/types";

const STYLES: Record<BookingStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  confirmed: "bg-emerald-500/15 text-emerald-300",
  completed: "bg-sky-500/15 text-sky-300",
  cancelled: "bg-slate-600/30 text-slate-400",
  no_show: "bg-rose-500/15 text-rose-300",
};

const LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export default function StatusBadge({ status }: { status: BookingStatus }) {
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
