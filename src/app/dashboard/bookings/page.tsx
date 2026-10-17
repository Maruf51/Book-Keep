import { getCurrentUser } from "@/lib/session";
import BookingsView from "@/components/dashboard/bookings-view";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  return <BookingsView role={user?.role ?? "staff"} />;
}
