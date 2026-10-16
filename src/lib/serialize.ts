export function serializeId(value: unknown): string {
  return String(value);
}

export function serializeCustomer(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  preferredChannel?: "email" | "sms" | "whatsapp" | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    notes: doc.notes ?? null,
    preferredChannel: doc.preferredChannel ?? "email",
    createdAt: doc.createdAt ?? null,
  };
}

export function serializeService(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  description?: string | null;
  durationMinutes: number;
  bufferMinutes?: number | null;
  price: number;
  staffIds?: unknown[];
  isActive?: boolean | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    description: doc.description ?? null,
    durationMinutes: doc.durationMinutes,
    bufferMinutes: doc.bufferMinutes ?? 0,
    price: doc.price,
    staffIds: (doc.staffIds ?? []).map(serializeId),
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt ?? null,
  };
}

export function serializeStaff(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  weeklyHours?: Array<{
    weekday: number;
    ranges: Array<{ start: string; end: string }>;
  }> | null;
  daysOff?: Array<{
    date: string;
    reason?: string | null;
    hoursOverride?: string | null;
  }> | null;
  isActive?: boolean | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    email: doc.email ?? null,
    photoUrl: doc.photoUrl ?? null,
    weeklyHours: (doc.weeklyHours ?? []).map((wh) => ({
      weekday: wh.weekday,
      ranges: (wh.ranges ?? []).map((r) => ({
        start: r.start,
        end: r.end,
      })),
    })),
    daysOff: (doc.daysOff ?? []).map((d) => ({
      date: d.date,
      reason: d.reason ?? null,
      hoursOverride: d.hoursOverride ?? null,
    })),
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt ?? null,
  };
}