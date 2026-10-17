import { requireRole } from "@/lib/auth";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { invoiceCreateSchema } from "@/lib/validators/invoice";
import { createInvoiceFromBooking, listInvoices } from "@/lib/invoice";

/**
 * GET /api/invoices (owner) — list invoices; `?status=paid|unpaid|void|draft|sent`
 * filters (P6-T2/T8). POST creates a draft from a booking.
 */

const STATUS_FILTERS: Record<string, string[]> = {
  draft: ["draft"],
  sent: ["sent"],
  paid: ["paid"],
  void: ["void"],
  unpaid: ["draft", "sent"],
};

export async function GET(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const status = new URL(request.url).searchParams.get("status");
    const statuses = status ? STATUS_FILTERS[status] : undefined;

    const invoices = await listInvoices({
      businessId: user.businessId,
      status: statuses,
    });
    return Response.json(invoices);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const payload = await parseJsonBody(request, invoiceCreateSchema);
    const invoice = await createInvoiceFromBooking({
      businessId: user.businessId,
      bookingId: payload.bookingId,
    });
    return Response.json(invoice, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
