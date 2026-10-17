import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { customerUpdateSchema } from "@/lib/validators/customer";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";
import { serializeBooking, serializeCustomer } from "@/lib/serialize";

/**
 * GET /api/customers/[id] — profile + booking history + total spent (P5-T4,
 * owner-only per spec §5). out: 200 CustomerDetailDto
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const { id } = await params;
    const doc = await CustomerModel.findOne({
      _id: id,
      businessId: user.businessId,
    }).lean();

    if (!doc) return jsonError("NOT_FOUND", "Customer not found.", 404);

    const bookings = await BookingModel.find({
      businessId: user.businessId,
      customerId: doc._id,
    })
      .sort({ startAt: -1 })
      .limit(100)
      .populate("serviceId", "name durationMinutes price")
      .populate("staffId", "name")
      .populate("customerId", "name email phone")
      .lean();

    const serialized = bookings.map((booking) => serializeBooking(booking));
    const totalSpent = serialized
      .filter((booking) => booking.status === "completed")
      .reduce((sum, booking) => sum + booking.price, 0);

    const dto = {
      ...serializeCustomer(doc),
      totalSpent,
      bookings: serialized,
    };

    return Response.json(dto);
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