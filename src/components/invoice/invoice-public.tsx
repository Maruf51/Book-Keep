import { formatMoney } from "@/lib/money";
import { formatDateTimeInTz } from "@/lib/time";
import type { PublicInvoiceDto } from "@/lib/types";
import InvoiceStatusBadge from "@/components/invoice/status-badge";
import PayButton from "@/components/invoice/pay-button";

/**
 * Public invoice view (PLAN P6-T4). Server-rendered from the token-scoped
 * DTO; amounts and dates are formatted in the business timezone/currency.
 */
export default function InvoicePublic({
  invoice,
  token,
  justPaid,
}: {
  invoice: PublicInvoiceDto;
  token: string;
  justPaid: boolean;
}) {
  const { currency, timezone } = invoice;
  const payable = invoice.status !== "paid" && invoice.status !== "void";
  const awaitingWebhook = justPaid && invoice.status !== "paid";

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">
            {invoice.business.name}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-50">
            Invoice {invoice.number}
          </h1>
          {invoice.customer ? (
            <p className="mt-1 text-sm text-slate-400">
              For {invoice.customer.name}
            </p>
          ) : null}
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </header>

      {invoice.status === "paid" && invoice.paidAt ? (
        <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Paid on {formatDateTimeInTz(invoice.paidAt, timezone)}. Thank you!
        </div>
      ) : awaitingWebhook ? (
        <div className="mt-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          We&apos;re confirming your payment. Refresh this page in a moment to
          see the updated status.
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {invoice.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="py-3">{item.description}</td>
                  <td className="py-3 text-right">{item.qty}</td>
                  <td className="py-3 text-right">
                    {formatMoney(item.unitPrice, currency)}
                  </td>
                  <td className="py-3 text-right">
                    {formatMoney(item.qty * item.unitPrice, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
        {payable ? (
          invoice.paymentConfigured ? (
            <PayButton token={token} />
          ) : (
            <p className="text-sm text-slate-400">
              Online payment isn&apos;t available yet. Please contact{" "}
              {invoice.business.name}
              {invoice.business.phone ? ` at ${invoice.business.phone}` : ""} to
              arrange payment.
            </p>
          )
        ) : invoice.status === "void" ? (
          <p className="text-sm text-slate-400">
            This invoice has been cancelled. Please contact{" "}
            {invoice.business.name} if you have questions.
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            This invoice has been paid. No further action is needed.
          </p>
        )}

        {invoice.business.address ? (
          <p className="mt-4 text-xs text-slate-500">
            {invoice.business.address}
          </p>
        ) : null}
      </section>
    </div>
  );
}
