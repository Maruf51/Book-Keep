"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import type { BusinessDto } from "@/lib/types";

type FormState = {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  phone: string;
  address: string;
  logoUrl: string;
  minNoticeHours: string;
  maxDaysAhead: string;
  cancelWindowHours: string;
  slotIntervalMinutes: string;
  autoConfirm: boolean;
  depositEnabled: boolean;
  depositPercent: string;
  taxRatePercent: string;
  defaultChannel: "email" | "sms" | "whatsapp";
  reminderHoursAhead: string;
};

const FALLBACK_TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

function toStringForm(business: BusinessDto): FormState {
  return {
    name: business.name,
    slug: business.slug,
    timezone: business.timezone,
    currency: business.currency,
    phone: business.phone ?? "",
    address: business.address ?? "",
    logoUrl: business.logoUrl ?? "",
    minNoticeHours: String(business.bookingRules.minNoticeHours),
    maxDaysAhead: String(business.bookingRules.maxDaysAhead),
    cancelWindowHours: String(business.bookingRules.cancelWindowHours),
    slotIntervalMinutes: String(business.bookingRules.slotIntervalMinutes),
    autoConfirm: business.bookingRules.autoConfirm,
    depositEnabled: business.bookingRules.depositEnabled,
    depositPercent: String(business.bookingRules.depositPercent),
    taxRatePercent: String(business.bookingRules.taxRatePercent),
    defaultChannel: business.notify.defaultChannel,
    reminderHoursAhead: String(business.notify.reminderHoursAhead),
  };
}

function numberOf(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";

/** Settings form (P6-T7). Mounted with the business already loaded. */
function SettingsForm({ business }: { business: BusinessDto }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toStringForm(business));
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  const timezones = useMemo(() => {
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
      ).supportedValuesOf?.("timeZone");
      if (supported && supported.length > 0) return supported;
    } catch {
      // ignore — fall through to the curated list
    }
    return FALLBACK_TIMEZONES;
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch<BusinessDto>("/api/business", { method: "PATCH", body: payload }),
    onSuccess: () => {
      setStatus({ ok: true, message: "Settings saved." });
      queryClient.invalidateQueries({ queryKey: ["business"] });
    },
    onError: (error) => setStatus({ ok: false, message: error.message }),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    saveMutation.mutate({
      name: form.name,
      slug: form.slug,
      timezone: form.timezone,
      currency: form.currency,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      bookingRules: {
        minNoticeHours: numberOf(form.minNoticeHours),
        maxDaysAhead: numberOf(form.maxDaysAhead, 60),
        cancelWindowHours: numberOf(form.cancelWindowHours),
        slotIntervalMinutes: numberOf(form.slotIntervalMinutes, 30),
        autoConfirm: form.autoConfirm,
        depositEnabled: form.depositEnabled,
        depositPercent: numberOf(form.depositPercent),
        taxRatePercent: numberOf(form.taxRatePercent),
      },
      notify: {
        defaultChannel: form.defaultChannel,
        reminderHoursAhead: numberOf(form.reminderHoursAhead, 24),
      },
    });
  }

  const payments = business.payments;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-50">Settings</h2>
        <p className="mt-1 text-sm text-slate-400">
          Business profile, booking rules and notifications.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Profile
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field
            label="Public slug"
            hint="Used in your public booking link /b/{slug}."
          >
            <input
              value={form.slug}
              onChange={(event) => update("slug", event.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(event) => update("timezone", event.target.value)}
              className={inputClass}
            >
              {!timezones.includes(form.timezone) ? (
                <option value={form.timezone}>{form.timezone}</option>
              ) : null}
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" hint="ISO 4217 code, e.g. BDT or USD.">
            <input
              value={form.currency}
              onChange={(event) => update("currency", event.target.value)}
              className={inputClass}
              maxLength={3}
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Logo URL">
            <input
              value={form.logoUrl}
              onChange={(event) => update("logoUrl", event.target.value)}
              className={inputClass}
              placeholder="https://…"
            />
          </Field>
          <Field label="Address">
            <input
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Booking rules
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Minimum notice (hours)">
            <input
              type="number"
              min={0}
              value={form.minNoticeHours}
              onChange={(event) => update("minNoticeHours", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Maximum days ahead">
            <input
              type="number"
              min={1}
              value={form.maxDaysAhead}
              onChange={(event) => update("maxDaysAhead", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Cancellation window (hours)">
            <input
              type="number"
              min={0}
              value={form.cancelWindowHours}
              onChange={(event) =>
                update("cancelWindowHours", event.target.value)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Slot interval (minutes)">
            <input
              type="number"
              min={5}
              value={form.slotIntervalMinutes}
              onChange={(event) =>
                update("slotIntervalMinutes", event.target.value)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Tax rate (%)">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.taxRatePercent}
              onChange={(event) => update("taxRatePercent", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.autoConfirm}
            onChange={(event) => update("autoConfirm", event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950"
          />
          Automatically confirm online bookings
        </label>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Deposits
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Field values are saved now; the deposit checkout flow activates in a
          later phase.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.depositEnabled}
            onChange={(event) => update("depositEnabled", event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950"
          />
          Require a deposit to confirm online bookings
        </label>
        <div className="mt-4 max-w-xs">
          <Field label="Deposit percent (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.depositPercent}
              onChange={(event) => update("depositPercent", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Notifications
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Default channel">
            <select
              value={form.defaultChannel}
              onChange={(event) =>
                update(
                  "defaultChannel",
                  event.target.value as FormState["defaultChannel"]
                )
              }
              className={inputClass}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </Field>
          <Field label="Reminder hours ahead">
            <input
              type="number"
              min={1}
              value={form.reminderHoursAhead}
              onChange={(event) =>
                update("reminderHoursAhead", event.target.value)
              }
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Payments
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-slate-300">Stripe secret key</span>
            <span
              className={
                payments.stripeConfigured ? "text-emerald-400" : "text-slate-500"
              }
            >
              {payments.stripeConfigured ? "Configured" : "Not configured"}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-300">Stripe webhook secret</span>
            <span
              className={
                payments.webhookConfigured
                  ? "text-emerald-400"
                  : "text-slate-500"
              }
            >
              {payments.webhookConfigured ? "Configured" : "Not configured"}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the environment to
          enable online invoice payments.
        </p>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : "Save settings"}
        </button>
        {status ? (
          <span
            className={
              status.ok ? "text-sm text-emerald-400" : "text-sm text-rose-400"
            }
          >
            {status.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export default function SettingsView() {
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });

  if (businessQuery.isLoading) {
    return <p className="text-slate-400">Loading settings…</p>;
  }
  if (businessQuery.isError || !businessQuery.data) {
    return (
      <p className="text-rose-400">
        {businessQuery.error?.message ?? "Could not load settings."}
      </p>
    );
  }

  return <SettingsForm key={businessQuery.data.id} business={businessQuery.data} />;
}
