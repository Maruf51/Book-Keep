import { notFound } from "next/navigation";
import { getPublicBusiness } from "@/lib/public-business-cached";
import { formatMoney } from "@/lib/money";

/**
 * Public business page (spec §5, PLAN P3-T6).
 * Server component backed by the cached `getPublicBusiness` loader;
 * 404 for unknown slugs.
 *
 * The slug (runtime data) is read at the top so `notFound()` can still return
 * a real 404 status — opt out of the static-shell requirement accordingly.
 */
export const instant = false;

export default async function PublicBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicBusiness(slug);

  if (!data) notFound();

  const { business, services, staff } = data;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">
              BookKeep
            </p>
            <h1 className="mt-1 text-2xl font-bold">{business.name}</h1>
          </div>
          <a
            href={`/b/${business.slug}/book`}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Book now
          </a>
        </div>
        {business.address || business.phone ? (
          <div className="mx-auto max-w-5xl px-6 pb-4 text-sm text-slate-400">
            {business.address ? <span>{business.address}</span> : null}
            {business.address && business.phone ? <span className="mx-2">·</span> : null}
            {business.phone ? <span>{business.phone}</span> : null}
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <section>
          <h2 className="text-lg font-semibold text-slate-200">Services</h2>
          {services.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No services are currently available to book.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  <h3 className="font-semibold text-slate-50">{service.name}</h3>
                  {service.description ? (
                    <p className="mt-1 flex-1 text-sm text-slate-400">
                      {service.description}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-slate-400">
                      {service.durationMinutes} min
                    </span>
                    <span className="font-semibold text-emerald-400">
                      {formatMoney(service.price, business.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-200">Our team</h2>
          {staff.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No team members yet.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3"
                >
                  {member.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.photoUrl}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                      {member.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-slate-200">
                    {member.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 rounded-2xl border border-emerald-900/60 bg-emerald-950/40 p-6 text-center">
          <p className="text-slate-200">Ready to book?</p>
          <a
            href={`/b/${business.slug}/book`}
            className="mt-3 inline-block rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Choose a service
          </a>
        </section>

        <p className="mt-8 text-center text-xs text-slate-600">
          All times shown in {business.timezone}
        </p>
      </div>
    </main>
  );
}
