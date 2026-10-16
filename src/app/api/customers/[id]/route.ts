import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { customerUpdateSchema } from "@/lib/validators/customer";
import CustomerModel from "@/models/customer";
import { serializeCustomer } from "@/lib/serialize";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const { id } = await params;
    const doc = await CustomerModel.findOne({
      _id: id,
      businessId: user.businessId,
    }).lean();

    if (!doc) return jsonError("NOT_FOUND", "Customer not found.", 404);

    return Response.json(serializeCustomer(doc));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const { id } = await params;
    const payload = await parseJsonBody(request, customerUpdateSchema);

    const doc = await CustomerModel.findOneAndUpdate(
      { _id: id, businessId: user.businessId },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!doc) return jsonError("NOT_FOUND", "Customer not found.", 404);

    return Response.json(serializeCustomer(doc.toObject()));
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "CONFLICT",
      duplicateMessage: "A customer with that email or phone already exists.",
    });
  }
}