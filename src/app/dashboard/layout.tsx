import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    return <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-50">Redirecting to login…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="w-72 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">BookKeep</p>
            <h1 className="mt-2 text-2xl font-bold">Dashboard</h1>
          </div>

          <nav className="space-y-2 text-sm text-slate-300">
            <a href="/dashboard" className="block rounded-lg px-3 py-2 hover:bg-slate-800">Overview</a>
            <a href="/dashboard/bookings" className="block rounded-lg px-3 py-2 hover:bg-slate-800">Bookings</a>
            <a href="/dashboard/services" className="block rounded-lg px-3 py-2 hover:bg-slate-800">Services</a>
            <a href="/dashboard/staff" className="block rounded-lg px-3 py-2 hover:bg-slate-800">Staff</a>
          </nav>

          <div className="mt-8 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
            <p className="text-slate-400">Signed in</p>
            <p className="mt-1 font-semibold text-slate-50">{user.name ?? user.email}</p>
            <p className="text-xs uppercase tracking-wide text-emerald-400">{user.role}</p>
          </div>
        </aside>

        <main className="flex-1 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <Suspense fallback={<div className="text-slate-300">Loading dashboard…</div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
