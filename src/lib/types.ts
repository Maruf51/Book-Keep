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
