import { requireRole } from "@/lib/auth";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { invoiceUpdateSchema } from "@/lib/validators/invoice";
import { getInvoiceDetail, updateInvoice } from "@/lib/invoice";

/**
 * GET /api/invoices/[id] (owner) — invoice detail.
 * PATCH edits draft line items or voids a non-paid invoice (P6-T2).
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
    const invoice = await getInvoiceDetail(user.businessId, id);
    if (!invoice) return jsonError("NOT_FOUND", "Invoice not found.", 404);

    return Response.json(invoice);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { id } = await params;
    const payload = await parseJsonBody(request, invoiceUpdateSchema);

    const invoice = await updateInvoice({
      businessId: user.businessId,
      invoiceId: id,
      lineItems: payload.lineItems,
      status: payload.status,
    });
    return Response.json(invoice);
  } catch (error) {
    return handleRouteError(error);
  }
}
