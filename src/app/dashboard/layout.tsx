import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import Providers from "@/components/providers";
import SignOutButton from "@/components/signout-button";

// The dashboard reads the session cookie at request time (auth gate), which
// cannot be prerendered into the static shell — this segment is allowed to
// block on the server per the Cache Components auth guide.
export const instant = false;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    return <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-50">Redirecting to login…</div>;
  }

  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/calendar", label: "Calendar" },
    { href: "/dashboard/bookings", label: "Bookings" },
    ...(user.role === "owner"
      ? [
          { href: "/dashboard/services", label: "Services" },
          { href: "/dashboard/staff", label: "Staff" },
          { href: "/dashboard/customers", label: "Customers" },
          { href: "/dashboard/invoices", label: "Invoices" },
          { href: "/dashboard/settings", label: "Settings" },
        ]
      : []),
    ...(user.role === "staff"
      ? [{ href: "/dashboard/availability", label: "Availability" }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="w-72 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">BookKeep</p>
            <h1 className="mt-2 text-2xl font-bold">Dashboard</h1>
          </div>

          <nav className="space-y-2 text-sm text-slate-300">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 hover:bg-slate-800"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-8 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
            <p className="text-slate-400">Signed in</p>
            <p className="mt-1 font-semibold text-slate-50">{user.name ?? user.email}</p>
            <p className="text-xs uppercase tracking-wide text-emerald-400">{user.role}</p>
            <div className="mt-3">
              <SignOutButton />
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <Providers>
            <Suspense fallback={<div className="text-slate-300">Loading dashboard…</div>}>
              {children}
            </Suspense>
          </Providers>
        </main>
      </div>
    </div>
  );
}
