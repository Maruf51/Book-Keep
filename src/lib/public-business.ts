import { connectToDatabase } from "@/lib/db";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import type { PublicBusinessDto } from "@/lib/types";

/**
 * Plain (uncached) loader for the public business payload — safe to call
 * from route handlers and tests. Returns null for unknown slugs — callers
 * turn that into a 404.
 */
export async function loadPublicBusiness(
  slug: string
): Promise<PublicBusinessDto | null> {
  await connectToDatabase();
  const business = await BusinessModel.findOne({ slug: slug.toLowerCase() }).lean();
  if (!business) return null;

  const [services, staff] = await Promise.all([
    ServiceModel.find({ businessId: business._id, isActive: true })
      .sort({ name: 1 })
      .lean(),
    StaffModel.find({ businessId: business._id, isActive: true })
      .sort({ name: 1 })
      .lean(),
  ]);

  return {
    business: {
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      currency: business.currency,
      phone: business.phone ?? null,
      address: business.address ?? null,
      logoUrl: business.logoUrl ?? null,
      bookingRules: {
        minNoticeHours: business.bookingRules?.minNoticeHours ?? 2,
        maxDaysAhead: business.bookingRules?.maxDaysAhead ?? 60,
        cancelWindowHours: business.bookingRules?.cancelWindowHours ?? 24,
        slotIntervalMinutes: business.bookingRules?.slotIntervalMinutes ?? 30,
        autoConfirm: business.bookingRules?.autoConfirm ?? true,
        depositEnabled: business.bookingRules?.depositEnabled ?? false,
        depositPercent: business.bookingRules?.depositPercent ?? 0,
        taxRatePercent: business.bookingRules?.taxRatePercent ?? 0,
      },
    },
    services: services.map((service) => ({
      id: String(service._id),
      name: service.name,
      description: service.description ?? null,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes ?? 0,
      price: service.price,
      staffIds: (service.staffIds ?? []).map((id: unknown) => String(id)),
    })),
    staff: staff.map((member) => ({
      id: String(member._id),
      name: member.name,
      photoUrl: member.photoUrl ?? null,
    })),
  };
}
