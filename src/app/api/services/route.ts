import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, parseJsonBody } from "@/lib/api";
import { serviceSchema } from "@/lib/validators/service";
import ServiceModel from "@/models/service";
import { serializeService } from "@/lib/serialize";

export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const payload = await parseJsonBody(request, serviceSchema);
    const doc = await ServiceModel.create({
      businessId: user.businessId,
      name: payload.name,
      description: payload.description,
      durationMinutes: payload.durationMinutes,
      bufferMinutes: payload.bufferMinutes,
      price: payload.price,
      staffIds: payload.staffIds ?? [],
      isActive: payload.isActive,
    });

    return Response.json(serializeService(doc.toObject()), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const docs = await ServiceModel.find({ businessId: user.businessId })
      .sort({ createdAt: -1 })
      .lean();

    return Response.json(docs.map(serializeService));
  } catch (error) {
    return handleRouteError(error);
  }
}
