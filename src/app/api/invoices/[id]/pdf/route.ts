import { requireRole } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { getInvoicePdfData } from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/pdf";

/**
 * GET /api/invoices/[id]/pdf (owner) — streams the invoice as `application/pdf`
 * (P6-T2/T3).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { id } = await params;
    const data = await getInvoicePdfData(user.businessId, id);
    if (!data) return jsonError("NOT_FOUND", "Invoice not found.", 404);

    const pdf = await renderInvoicePdf(data);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${data.number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
