import { getCurrentUser } from "@/lib/session";
import BookingDetailView from "@/components/dashboard/booking-detail-view";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  return <BookingDetailView bookingId={id} role={user?.role ?? "staff"} />;
}
