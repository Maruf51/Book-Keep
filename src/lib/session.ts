import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "staff";
  businessId: string | null;
  staffProfileId: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  "use cache: private";

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    role: session.user.role ?? "owner",
    businessId: session.user.businessId ?? null,
    staffProfileId: session.user.staffProfileId ?? null,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
