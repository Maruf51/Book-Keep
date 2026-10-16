import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import AvailabilityEditor from "@/components/staff/availability-editor";

async function AvailabilityContent() {
  const user = await getCurrentUser();

  if (!user) {
    return <p className="text-slate-400">Redirecting to login…</p>;
  }

  if (user.role !== "staff" || !user.staffProfileId) {
    return (
      <div>
        <h2 className="text-3xl font-bold text-slate-50">My availability</h2>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">This page is for staff members.</p>
          <p className="mt-1 text-sm text-slate-500">
            Owners manage team availability from the Staff page.
          </p>
          <a
            href="/dashboard/staff"
            className="mt-4 inline-block rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Go to Staff
          </a>
        </div>
      </div>
    );
  }

  return <AvailabilityEditor staffId={user.staffProfileId} />;
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading availability…</p>}>
      <AvailabilityContent />
    </Suspense>
  );
}
