import { requireRole } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { sendInvoice } from "@/lib/invoice";

/**
 * POST /api/invoices/[id]/send (owner) — emails the public invoice link and
 * moves a draft to `sent` (P6-T2).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { id } = await params;
    const invoice = await sendInvoice({
      businessId: user.businessId,
      invoiceId: id,
    });
    return Response.json(invoice);
  } catch (error) {
    return handleRouteError(error);
  }
}
