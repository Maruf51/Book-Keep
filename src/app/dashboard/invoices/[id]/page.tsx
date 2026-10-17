import { getCurrentUser } from "@/lib/session";
import InvoiceDetailView from "@/components/dashboard/invoice-detail-view";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (user?.role !== "owner") {
    return (
      <div>
        <h2 className="text-3xl font-bold text-slate-50">Invoice</h2>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">This page is for owners.</p>
        </div>
      </div>
    );
  }

  return <InvoiceDetailView invoiceId={id} />;
}
