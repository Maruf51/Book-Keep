import type { Metadata } from "next";
import { getInvoiceByPublicToken } from "@/lib/invoice";
import InvoicePublic from "@/components/invoice/invoice-public";

export const metadata: Metadata = {
  title: "Invoice — BookKeep",
};

/**
 * Public invoice page (spec §10, PLAN P6-T4). The token is the URL secret and
 * is read at request time, so this route opts out of the static-shell
 * requirement.
 */
export const instant = false;

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { publicToken } = await params;
  const { paid } = await searchParams;

  const invoice = await getInvoiceByPublicToken(publicToken);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl">
        {invoice ? (
          <InvoicePublic
            invoice={invoice}
            token={publicToken}
            justPaid={paid === "1"}
          />
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-700 p-10 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">
              BookKeep
            </p>
            <h1 className="mt-3 text-xl font-semibold text-slate-100">
              Invoice not found
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              This invoice link is invalid or has expired.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
