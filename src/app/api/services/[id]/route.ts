import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { serviceUpdateSchema } from "@/lib/validators/service";
import ServiceModel from "@/models/service";
import { serializeService } from "@/lib/serialize";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const { id } = await params;
    const doc = await ServiceModel.findOne({
      _id: id,
      businessId: user.businessId,
    }).lean();

    if (!doc) return jsonError("NOT_FOUND", "Service not found.", 404);

    return Response.json(serializeService(doc));
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
    await connectToDatabase();

    const { id } = await params;
    const payload = await parseJsonBody(request, serviceUpdateSchema);

    const doc = await ServiceModel.findOneAndUpdate(
      { _id: id, businessId: user.businessId },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!doc) return jsonError("NOT_FOUND", "Service not found.", 404);

    return Response.json(serializeService(doc.toObject()));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE = soft delete: the service is hidden (isActive: false), never removed. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const { id } = await params;
    const doc = await ServiceModel.findOneAndUpdate(
      { _id: id, businessId: user.businessId },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!doc) return jsonError("NOT_FOUND", "Service not found.", 404);

    return Response.json(serializeService(doc.toObject()));
  } catch (error) {
    return handleRouteError(error);
  }
}
