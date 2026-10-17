"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
  PublicBookingCreatedDto,
  PublicBusinessDto,
  SlotsResponse,
} from "@/lib/types";
import { formatMoney } from "@/lib/money";
import {
  formatDateLabelClient,
  maxDateInTzClient,
  todayInTzClient,
} from "@/lib/wizard-dates";

type SlotChoice = { startAt: string; label: string; staffId: string };

const detailsSchema = z.object({
  name: z.string().min(2, "Please enter your full name."),
  email: z.string().email("Please enter a valid email address."),
  phone: z.string().max(32, "That phone number looks too long.").optional(),
});

type DetailsForm = z.infer<typeof detailsSchema>;

/**
 * Public booking wizard, steps 1–5 (spec §10, PLAN P3-T7 + P4-T5):
 * service → staff (incl. Any available) → date + time grid → details →
 * confirmation with the token manage link.
 */
export default function BookingWizard({
  slug,
  data,
}: {
  slug: string;
  data: PublicBusinessDto;
}) {
  const { business, services, staff } = data;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffChoice, setStaffChoice] = useState<string | null>(null); // "any" | staffId
  const [date, setDate] = useState<string>(() =>
    todayInTzClient(business.timezone)
  );
  const [slots, setSlots] = useState<SlotChoice[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingCreatedDto | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: "", email: "", phone: "" },
  });

  const service = services.find((s) => s.id === serviceId) ?? null;

  // Staff eligible for the chosen service (empty assignment = anyone).
  const eligibleStaff = useMemo(() => {
    if (!service) return [];
    if (service.staffIds.length === 0) return staff;
    return staff.filter((member) => service.staffIds.includes(member.id));
  }, [service, staff]);

  const today = todayInTzClient(business.timezone);
  const maxDate = maxDateInTzClient(
    business.timezone,
    business.bookingRules.maxDaysAhead
  );

  // Slots load on explicit user actions (choosing staff/date) — never in an
  // effect — so loading states are plain event-driven state updates.
  async function fetchForStaff(
    serviceIdParam: string,
    dateParam: string,
    memberId: string
  ): Promise<SlotsResponse> {
    const query = new URLSearchParams({
      serviceId: serviceIdParam,
      staffId: memberId,
      date: dateParam,
    });
    const response = await fetch(`/api/public/${slug}/slots?${query.toString()}`);
    const payload = (await response.json().catch(() => null)) as
      | SlotsResponse
      | { error?: { message?: string } }
      | null;
    if (!response.ok) {
      throw new Error(
        (payload as { error?: { message?: string } })?.error?.message ??
          "Could not load available times."
      );
    }
    return payload as SlotsResponse;
  }

  async function loadSlots(
    serviceIdParam: string,
    staffChoiceParam: string,
    dateParam: string,
    staffPool: Array<{ id: string }>
  ): Promise<void> {
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots([]);
    setChoice(null);
    try {
      let merged: SlotChoice[];
      if (staffChoiceParam === "any") {
        // Union of slots across eligible staff; pin the first staff member
        // that offers each start time (booking API receives that staffId).
        const results = await Promise.all(
          staffPool.map(async (member) => {
            try {
              const result = await fetchForStaff(
                serviceIdParam,
                dateParam,
                member.id
              );
              return result.slots.map((slot) => ({
                ...slot,
                staffId: member.id,
              }));
            } catch {
              return [] as SlotChoice[]; // one failing staff must not break the union
            }
          })
        );
        const byStart = new Map<string, SlotChoice>();
        for (const list of results) {
          for (const slot of list) {
            if (!byStart.has(slot.startAt)) byStart.set(slot.startAt, slot);
          }
        }
        merged = [...byStart.values()].sort((a, b) =>
          a.startAt.localeCompare(b.startAt)
        );
      } else {
        const result = await fetchForStaff(
          serviceIdParam,
          dateParam,
          staffChoiceParam
        );
        merged = result.slots.map((slot) => ({
          ...slot,
          staffId: staffChoiceParam,
        }));
      }
      setSlots(merged);
    } catch (error) {
      setSlots([]);
      setSlotsError(
        error instanceof Error ? error.message : "Could not load times."
      );
    } finally {
      setSlotsLoading(false);
    }
  }

  function pickService(id: string) {
    setServiceId(id);
    setStaffChoice(null);
    setChoice(null);
    setSlots([]);
    setStep(2);
  }

  function pickStaff(choiceValue: string) {
    setStaffChoice(choiceValue);
    setChoice(null);
    setStep(3);
    if (serviceId) {
      void loadSlots(serviceId, choiceValue, date, staffPoolFor(serviceId));
    }
  }

  function pickDate(nextDate: string) {
    setDate(nextDate);
    setChoice(null);
    if (serviceId && staffChoice) {
      void loadSlots(serviceId, staffChoice, nextDate, staffPoolFor(serviceId));
    }
  }

  function staffPoolFor(serviceIdParam: string): Array<{ id: string }> {
    const svc = services.find((item) => item.id === serviceIdParam);
    if (!svc) return [];
    if (svc.staffIds.length === 0) return staff;
    return staff.filter((member) => svc.staffIds.includes(member.id));
  }

  function staffName(id: string): string {
    if (id === "any") return "Any available";
    return staff.find((member) => member.id === id)?.name ?? "Any available";
  }

  async function onSubmitDetails(form: DetailsForm) {
    if (!serviceId || !choice) return;
    setSubmitError(null);
    try {
      const response = await fetch(`/api/public/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          staffId: choice.staffId,
          startAt: choice.startAt,
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | PublicBookingCreatedDto
        | { error?: { code?: string; message?: string } }
        | null;

      if (!response.ok) {
        const envelope = payload as
          | { error?: { code?: string; message?: string } }
          | null;
        setSubmitError(
          envelope?.error?.message ?? "Could not complete your booking."
        );
        if (envelope?.error?.code === "SLOT_TAKEN") {
          // The slot was taken while filling the form — refresh the grid.
          setChoice(null);
          setStep(3);
          if (serviceId && staffChoice) {
            void loadSlots(
              serviceId,
              staffChoice,
              date,
              staffPoolFor(serviceId)
            );
          }
        }
        return;
      }

      const created = payload as PublicBookingCreatedDto;
      // Keep the manage token for refresh — read back from the manage URL.
      try {
        const token = created.manageUrl.split("/").filter(Boolean).pop();
        if (token) {
          window.sessionStorage.setItem(
            `bookkeep:manage:${created.bookingId}`,
            token
          );
        }
      } catch {
        // sessionStorage may be unavailable (private mode) — non-fatal.
      }

      setResult(created);
      setStep(5);
    } catch {
      setSubmitError("Could not complete your booking. Please try again.");
    }
  }

  function bookAnother() {
    reset();
    setResult(null);
    setSubmitError(null);
    setServiceId(null);
    setStaffChoice(null);
    setChoice(null);
    setSlots([]);
    setDate(todayInTzClient(business.timezone));
    setStep(1);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Progress */}
      {step < 5 ? (
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {[
            { n: 1, label: "Service" },
            { n: 2, label: "Staff" },
            { n: 3, label: "Date & time" },
            { n: 4, label: "Your details" },
          ].map((entry) => (
            <li key={entry.n} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  step >= entry.n
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {entry.n}
              </span>
              <span className={step === entry.n ? "text-slate-100" : ""}>
                {entry.label}
              </span>
              {entry.n < 4 ? <span className="text-slate-700">→</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {/* Step 1 — service */}
      {step === 1 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-50">Choose a service</h2>
          <div className="mt-4 space-y-3">
            {services.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickService(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl border p-5 text-left transition ${
                  serviceId === item.id
                    ? "border-emerald-600 bg-emerald-950/40"
                    : "border-slate-800 bg-slate-900 hover:border-slate-600"
                }`}
              >
                <span>
                  <span className="block font-semibold text-slate-50">
                    {item.name}
                  </span>
                  {item.description ? (
                    <span className="mt-0.5 block text-sm text-slate-400">
                      {item.description}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.durationMinutes} min
                  </span>
                </span>
                <span className="font-semibold text-emerald-400">
                  {formatMoney(item.price, business.currency)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Step 2 — staff */}
      {step === 2 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-50">
            Choose a staff member
          </h2>
          <div className="mt-4 space-y-3">
            <WizardOption
              selected={staffChoice === "any"}
              onClick={() => pickStaff("any")}
              title="Any available"
              subtitle="Show times from anyone who offers this service"
            />
            {eligibleStaff.map((member) => (
              <WizardOption
                key={member.id}
                selected={staffChoice === member.id}
                onClick={() => pickStaff(member.id)}
                title={member.name}
              />
            ))}
            {eligibleStaff.length === 0 ? (
              <p className="text-sm text-slate-500">
                No specific staff assigned — pick “Any available”.
              </p>
            ) : null}
          </div>
          <BackButton onClick={() => setStep(1)} />
        </section>
      ) : null}

      {/* Step 3 — date + time grid */}
      {step === 3 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-50">Pick a time</h2>
          <p className="mt-1 text-sm text-slate-400">
            {service?.name} with {staffName(staffChoice ?? "any")} · all times in{" "}
            {business.timezone}
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="text-sm text-slate-300">
              Date
              <input
                type="date"
                value={date}
                min={today}
                max={maxDate}
                onChange={(event) => pickDate(event.target.value)}
                className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <p className="pb-2 text-xs text-slate-500">
              Book up to {business.bookingRules.maxDaysAhead} days ahead
            </p>
          </div>

          <div className="mt-6 min-h-[120px]">
            {slotsLoading ? (
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
                Loading available times…
              </div>
            ) : slotsError ? (
              <p className="text-sm text-rose-400">{slotsError}</p>
            ) : slots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
                <p className="text-sm text-slate-300">No available times.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Try another date
                  {date === maxDate ? " — you are at the booking horizon" : ""}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const key = `${slot.startAt}-${slot.staffId}`;
                  const selected =
                    choice?.startAt === slot.startAt &&
                    choice?.staffId === slot.staffId;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={slotsLoading}
                      onClick={() => setChoice(slot)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-600"
                      }`}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {choice ? (
            <div className="mt-6 rounded-2xl border border-emerald-900/60 bg-emerald-950/40 p-4 text-sm text-slate-200">
              <p>
                <span className="text-slate-400">Selected:</span>{" "}
                <strong>{formatDateLabelClient(date, business.timezone)}</strong>{" "}
                at <strong>{choice.label}</strong>
                {staffChoice === "any" ? (
                  <span className="text-slate-400">
                    {" "}
                    with {staffName(choice.staffId)}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {service?.name} · {service?.durationMinutes} min ·{" "}
                {service ? formatMoney(service.price, business.currency) : ""}
              </p>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Continue
              </button>
            </div>
          ) : null}

          <BackButton onClick={() => setStep(2)} />
        </section>
      ) : null}

      {/* Step 4 — details */}
      {step === 4 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-50">Your details</h2>
          <p className="mt-1 text-sm text-slate-400">
            {service?.name} · {formatDateLabelClient(date, business.timezone)} at{" "}
            {choice?.label} · {staffName(choice?.staffId ?? "any")}
          </p>

          <form
            onSubmit={handleSubmit(onSubmitDetails)}
            className="mt-6 space-y-4"
            noValidate
          >
            <label className="block text-sm text-slate-300">
              Full name
              <input
                type="text"
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                {...register("name")}
              />
              {errors.name ? (
                <span className="mt-1 block text-xs text-rose-400">
                  {errors.name.message}
                </span>
              ) : null}
            </label>

            <label className="block text-sm text-slate-300">
              Email
              <input
                type="email"
                autoComplete="email"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                {...register("email")}
              />
              {errors.email ? (
                <span className="mt-1 block text-xs text-rose-400">
                  {errors.email.message}
                </span>
              ) : null}
            </label>

            <label className="block text-sm text-slate-300">
              Phone <span className="text-slate-500">(optional)</span>
              <input
                type="tel"
                autoComplete="tel"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                {...register("phone")}
              />
              {errors.phone ? (
                <span className="mt-1 block text-xs text-rose-400">
                  {errors.phone.message}
                </span>
              ) : null}
            </label>

            {submitError ? (
              <p className="text-sm text-rose-400">{submitError}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Booking…" : "Confirm booking"}
            </button>
          </form>

          <BackButton onClick={() => setStep(3)} />
        </section>
      ) : null}

      {/* Step 5 — confirmation */}
      {step === 5 && result ? (
        <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 p-6">
          <h2 className="text-xl font-bold text-slate-50">
            {result.status === "pending"
              ? "Booking received"
              : "Your booking is confirmed"}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {result.status === "pending"
              ? "We have received your booking. The business will confirm it shortly."
              : "We have emailed you the details. See you soon!"}
          </p>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
            <p>
              <span className="text-slate-400">Service:</span>{" "}
              {service?.name ?? "Appointment"}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">When:</span>{" "}
              {formatDateLabelClient(date, business.timezone)} at{" "}
              {choice?.label} ({result.timezone})
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Status:</span>{" "}
              <span className="font-semibold uppercase tracking-wide text-emerald-400">
                {result.status}
              </span>
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Manage your booking
            </p>
            <a
              href={result.manageUrl}
              className="mt-1 block break-all text-sm text-emerald-400 hover:underline"
            >
              {result.manageUrl}
            </a>
            <p className="mt-2 text-xs text-slate-500">
              Keep this link to reschedule or cancel. A copy is also in your
              email.
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <a
              href={result.manageUrl}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Manage booking
            </a>
            <button
              type="button"
              onClick={bookAnother}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Book another
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WizardOption({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-emerald-600 bg-emerald-950/40"
          : "border-slate-800 bg-slate-900 hover:border-slate-600"
      }`}
    >
      <span className="block font-semibold text-slate-50">{title}</span>
      {subtitle ? (
        <span className="mt-0.5 block text-sm text-slate-400">{subtitle}</span>
      ) : null}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 text-sm text-slate-400 hover:text-slate-200"
    >
      ← Back
    </button>
  );
}
