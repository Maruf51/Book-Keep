import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicBusiness } from "@/lib/public-business-cached";
import BookingWizard from "@/components/booking/wizard";

/**
 * Public booking wizard page (spec §5 / §10, PLAN P3-T7).
 * Server shell loads the cached business payload; the wizard itself is a
 * client component driving steps 1–5.
 *
 * Reads the slug at the top so an unknown slug returns a real 404.
 */
export const instant = false;

export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicBusiness(slug);

  if (!data) notFound();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href={`/b/${data.business.slug}`} className="text-sm text-slate-400 hover:text-slate-200">
            ← {data.business.name}
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">
            BookKeep
          </p>
        </div>
      </header>

      {data.services.length === 0 ? (
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-slate-300">No services are available to book right now.</p>
        </div>
      ) : (
        <BookingWizard slug={data.business.slug} data={data} />
      )}
    </main>
  );
}
