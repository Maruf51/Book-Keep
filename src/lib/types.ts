export type ServiceDto = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  staffIds: string[];
  isActive: boolean;
  createdAt: string | null;
};

export type StaffDto = {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  weeklyHours: Array<{
    weekday: number;
    ranges: Array<{ start: string; end: string }>;
  }>;
  daysOff: Array<{ date: string; reason: string | null; hoursOverride: string | null }>;
  isActive: boolean;
  createdAt: string | null;
};

export type CustomerDto = {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  preferredChannel: "email" | "sms" | "whatsapp";
  createdAt: string | null;
};

/** Public business payload served to /b/[slug] and its wizard (no secrets). */
export type PublicBusinessDto = {
  business: {
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
    bookingRules: {
      minNoticeHours: number;
      maxDaysAhead: number;
      cancelWindowHours: number;
      slotIntervalMinutes: number;
      autoConfirm: boolean;
      depositEnabled: boolean;
      depositPercent: number;
      taxRatePercent: number;
    };
  };
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    bufferMinutes: number;
    price: number;
    staffIds: string[];
  }>;
  staff: Array<{ id: string; name: string; photoUrl: string | null }>;
};

export type SlotsResponse = {
  timezone: string;
  slots: Array<{ startAt: string; label: string }>;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** Public (token-scoped) view of a booking served to /booking/[token]. */
export type PublicBookingDto = {
  id: string;
  status: BookingStatus;
  paymentStatus: "unpaid" | "paid" | "refunded";
  startAt: string;
  endAt: string;
  durationMinutes: number;
  price: number;
  createdAt: string | null;
  cancelledAt: string | null;
  service: { id: string; name: string; durationMinutes: number } | null;
  staff: { id: string; name: string } | null;
  customer: { name: string; email: string | null } | null;
  business: {
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    phone: string | null;
    address: string | null;
  };
  cancelWindowHours: number;
  maxDaysAhead: number;
  /** ISO instant after which cancellation is no longer allowed (null if N/A). */
  cancelDeadline: string | null;
  canCancel: boolean;
  canReschedule: boolean;
};

/** 201 response of POST /api/public/[slug]/bookings (spec §6). */
export type PublicBookingCreatedDto = {
  bookingId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  timezone: string;
  manageUrl: string;
};

/** Dashboard booking row/detail (owner + staff scoped). */
export type BookingDto = {
  id: string;
  businessId: string;
  status: BookingStatus;
  paymentStatus: "unpaid" | "paid" | "refunded";
  source: "online" | "manual";
  startAt: string;
  endAt: string;
  price: number;
  createdAt: string | null;
  cancelledAt: string | null;
  seriesId: string | null;
  recurrence: {
    freq: "weekly" | "monthly";
    interval: number;
    count: number;
  } | null;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  } | null;
  staff: { id: string; name: string } | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

/** GET /api/dashboard/summary (spec §6). */
export type DashboardSummaryDto = {
  date: string;
  timezone: string;
  currency: string;
  today: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
  };
  revenue: { today: number; month: number };
  /** 0..1 over the trailing window. */
  noShowRate: number;
};

/** Session-scoped business profile (GET /api/business). */
export type BusinessDto = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  bookingRules: {
    minNoticeHours: number;
    maxDaysAhead: number;
    cancelWindowHours: number;
    slotIntervalMinutes: number;
    autoConfirm: boolean;
    depositEnabled: boolean;
    depositPercent: number;
    taxRatePercent: number;
  };
  notify: {
    defaultChannel: "email" | "sms" | "whatsapp";
    reminderHoursAhead: number;
  };
  /** Runtime env-derived payment status shown on the settings page. */
  payments: {
    stripeConfigured: boolean;
    webhookConfigured: boolean;
  };
};

/** Customer detail with booking history (GET /api/customers/[id]). */
export type CustomerDetailDto = CustomerDto & {
  totalSpent: number;
  bookings: BookingDto[];
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type InvoiceLineItem = {
  description: string;
  qty: number;
  unitPrice: number;
};

/** Dashboard invoice row/detail (owner-only, tenant scoped). */
export type InvoiceDto = {
  id: string;
  businessId: string;
  number: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  paidAt: string | null;
  createdAt: string | null;
  stripeSessionId: string | null;
  customer: { id: string; name: string; email: string | null } | null;
  booking: { id: string; startAt: string; status: BookingStatus } | null;
};

/** Public (token-scoped) invoice view served to /invoice/[publicToken]. */
export type PublicInvoiceDto = {
  number: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  timezone: string;
  paidAt: string | null;
  createdAt: string | null;
  customer: { name: string; email: string | null } | null;
  serviceName: string | null;
  business: {
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
  };
  /** False when Stripe keys are absent — the public page hides the Pay button. */
  paymentConfigured: boolean;
};

/** Data needed to render an invoice as a PDF (P6-T3). */
export type InvoicePdfData = {
  number: string;
  status: InvoiceStatus;
  currency: string;
  timezone: string;
  createdAt: string | null;
  paidAt: string | null;
  business: {
    name: string;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
  };
  customer: { name: string; email: string | null } | null;
  booking: { startAt: string; serviceName: string | null } | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
};
