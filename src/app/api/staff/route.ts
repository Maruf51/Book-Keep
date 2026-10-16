import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, parseJsonBody } from "@/lib/api";
import { staffSchema } from "@/lib/validators/staff";
import StaffModel from "@/models/staff";
import { serializeStaff } from "@/lib/serialize";

export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const payload = await parseJsonBody(request, staffSchema);
    const doc = await StaffModel.create({
      businessId: user.businessId,
      name: payload.name,
      email: payload.email,
      photoUrl: payload.photoUrl,
      weeklyHours: payload.weeklyHours ?? [],
      daysOff: payload.daysOff ?? [],
      isActive: payload.isActive,
    });

    return Response.json(serializeStaff(doc.toObject()), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const docs = await StaffModel.find({ businessId: user.businessId })
      .sort({ createdAt: -1 })
      .lean();

    return Response.json(docs.map(serializeStaff));
  } catch (error) {
    return handleRouteError(error);
  }
}
