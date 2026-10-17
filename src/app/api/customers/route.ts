import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, parseJsonBody } from "@/lib/api";
import { customerSchema } from "@/lib/validators/customer";
import CustomerModel from "@/models/customer";
import { serializeCustomer } from "@/lib/serialize";

export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    const payload = await parseJsonBody(request, customerSchema);
    const doc = await CustomerModel.create({
      businessId: user.businessId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      notes: payload.notes,
      preferredChannel: payload.preferredChannel ?? "email",
    });

    return Response.json(serializeCustomer(doc.toObject()), { status: 201 });
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "CONFLICT",
      duplicateMessage: "A customer with that email or phone already exists.",
    });
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const filter: Record<string, unknown> = { businessId: user.businessId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }

    const docs = await CustomerModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return Response.json(docs.map(serializeCustomer));
  } catch (error) {
    return handleRouteError(error);
  }
}