import { getCurrentUser } from "@/lib/session";
import SettingsView from "@/components/dashboard/settings-view";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (user?.role !== "owner") {
    return (
      <div>
        <h2 className="text-3xl font-bold text-slate-50">Settings</h2>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">This page is for owners.</p>
        </div>
      </div>
    );
  }

  return <SettingsView />;
}
