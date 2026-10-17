import { getCurrentUser } from "@/lib/session";
import ManualBookingView from "@/components/dashboard/manual-booking-view";

export default async function NewBookingPage() {
  const user = await getCurrentUser();
  return (
    <ManualBookingView
      role={user?.role ?? "staff"}
      staffProfileId={user?.staffProfileId ?? null}
    />
  );
}
