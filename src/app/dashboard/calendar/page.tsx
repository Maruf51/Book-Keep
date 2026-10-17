import { getCurrentUser } from "@/lib/session";
import CalendarView from "@/components/dashboard/calendar-view";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  return (
    <CalendarView
      role={user?.role ?? "staff"}
      staffProfileId={user?.staffProfileId ?? null}
    />
  );
}
