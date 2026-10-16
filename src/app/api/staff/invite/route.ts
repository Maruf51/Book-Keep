import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { staffInviteSchema } from "@/lib/validators/staff";
import StaffModel from "@/models/staff";
import UserModel from "@/models/user";
import BusinessModel from "@/models/business";
import { sendStaffInviteEmail } from "@/lib/email";
import { serializeStaff } from "@/lib/serialize";

/**
 * POST /api/staff/invite (owner only)
 *
 * Creates a Staff profile and a linked User (role: staff, random temporary
 * password) in one call, then emails the invitation. Without RESEND_API_KEY
 * the email is logged to the console as a stub.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    const payload = await parseJsonBody(request, staffInviteSchema);
    const email = payload.email.toLowerCase();

    const existing = await UserModel.findOne({ email });
    if (existing) {
      return jsonError("CONFLICT", "A user with that email already exists.", 409);
    }

    const staff = await StaffModel.create({
      businessId: user.businessId,
      name: payload.name,
      email,
      isActive: true,
    });

    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await hash(tempPassword, 12);

    const staffUser = await UserModel.create({
      name: payload.name,
      email,
      passwordHash,
      role: "staff",
      businessId: staff.businessId,
      staffProfileId: staff._id,
    });

    const business = await BusinessModel.findById(staff.businessId).lean();
    const baseUrl =
      process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    const sendResult = await sendStaffInviteEmail({
      to: email,
      businessName: business?.name ?? "BookKeep",
      staffName: payload.name,
      tempPassword,
      loginUrl: `${baseUrl}/login`,
    });

    return Response.json(
      {
        staff: serializeStaff(staff.toObject()),
        userId: String(staffUser._id),
        emailDelivered: sendResult.ok,
        emailStubbed: sendResult.stub,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "CONFLICT",
      duplicateMessage: "A user with that email already exists.",
    });
  }
}
