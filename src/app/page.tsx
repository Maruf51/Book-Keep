export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-20 text-slate-50">
      <div className="max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
          BookKeep
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Appointment booking for modern service businesses
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          Booking, staff scheduling, payments, and customer follow-up in one place.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <a
            href="/login"
            className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Open dashboard
          </a>
          <a
            href="/register"
            className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900"
          >
            Create account
          </a>
        </div>
      </div>
    </main>
  );
}
