import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { staffUpdateSchema } from "@/lib/validators/staff";
import StaffModel from "@/models/staff";
import { serializeStaff } from "@/lib/serialize";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const { id } = await params;
    // Staff may only read their own profile.
    if (user.role === "staff" && user.staffProfileId !== id) {
      return jsonError("FORBIDDEN", "You don't have permission to do that.", 403);
    }

    const doc = await StaffModel.findOne({
      _id: id,
      businessId: user.businessId,
    }).lean();

    if (!doc) return jsonError("NOT_FOUND", "Staff member not found.", 404);

    return Response.json(serializeStaff(doc));
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
    // Staff may only update their own profile (hours and days off).
    if (user.role === "staff" && user.staffProfileId !== id) {
      return jsonError("FORBIDDEN", "You don't have permission to do that.", 403);
    }

    const payload = await parseJsonBody(request, staffUpdateSchema);

    const doc = await StaffModel.findOneAndUpdate(
      { _id: id, businessId: user.businessId },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!doc) return jsonError("NOT_FOUND", "Staff member not found.", 404);

    return Response.json(serializeStaff(doc.toObject()));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE = soft delete: deactivate the staff member, keep history intact. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const { id } = await params;
    const doc = await StaffModel.findOneAndUpdate(
      { _id: id, businessId: user.businessId },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!doc) return jsonError("NOT_FOUND", "Staff member not found.", 404);

    return Response.json({ deactivated: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
