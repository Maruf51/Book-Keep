"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import {
  formatDayLabelClient,
  todayInTzClient,
} from "@/lib/wizard-dates";
import type {
  BookingDto,
  BusinessDto,
  CustomerDto,
  ServiceDto,
  SlotsResponse,
  StaffDto,
} from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";

export default function ManualBookingView({
  role,
  staffProfileId,
}: {
  role: "owner" | "staff";
  staffProfileId: string | null;
}) {
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState(role === "staff" ? staffProfileId ?? "" : "");
  const [date, setDate] = useState("");
  const [startAt, setStartAt] = useState<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: () => apiFetch<ServiceDto[]>("/api/services"),
  });
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch<StaffDto[]>("/api/staff"),
  });

  const timezone = businessQuery.data?.timezone ?? "UTC";
  const currency = businessQuery.data?.currency ?? "BDT";
  const effectiveDate = date || todayInTzClient(timezone);

  const services = (servicesQuery.data ?? []).filter((s) => s.isActive);
  const service = services.find((s) => s.id === serviceId) ?? null;
  const allStaff = (staffQuery.data ?? []).filter((s) => s.isActive);

  const eligiblePool =
    service && service.staffIds.length > 0
      ? allStaff.filter((member) => service.staffIds.includes(member.id))
      : allStaff;
  const eligibleStaff =
    role === "staff"
      ? eligiblePool.filter((member) => member.id === staffProfileId)
      : eligiblePool;

  const slotsQuery = useQuery({
    queryKey: ["slots", serviceId, staffId, effectiveDate],
    queryFn: () =>
      apiFetch<SlotsResponse>(
        `/api/slots?serviceId=${serviceId}&staffId=${staffId}&date=${effectiveDate}`
      ),
    enabled:
      Boolean(serviceId) &&
      Boolean(staffId) &&
      /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate),
  });

  const customerSearch = useQuery({
    queryKey: ["customer-search", customerQuery],
    queryFn: () =>
      apiFetch<CustomerDto[]>(
        `/api/customers?q=${encodeURIComponent(customerQuery)}`
      ),
    enabled: role === "owner" && customerQuery.trim().length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { serviceId, staffId, startAt };
      if (selectedCustomer) {
        body.customerId = selectedCustomer.id;
      } else {
        body.name = name;
        body.email = email || undefined;
        body.phone = phone || undefined;
      }
      return apiFetch<BookingDto>("/api/bookings", { method: "POST", body });
    },
    onSuccess: (booking) => {
      router.push(`/dashboard/bookings/${booking.id}`);
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  function submit() {
    setError(null);
    if (!serviceId) return setError("Choose a service.");
    if (!staffId) return setError("Choose a staff member.");
    if (!startAt) return setError("Pick a time slot.");
    if (!selectedCustomer) {
      if (name.trim().length < 2) return setError("Enter the customer name.");
      if (!email.trim() && !phone.trim()) {
        return setError("Enter an email or phone number.");
      }
    }
    createMutation.mutate();
  }

  return (
    <div>
      <Link
        href="/dashboard/bookings"
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Bookings
      </Link>
      <h2 className="mt-3 text-3xl font-bold text-slate-50">New booking</h2>
      <p className="mt-1 text-sm text-slate-400">
        Manual booking for walk-ins and phone calls.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            1. Service &amp; staff
          </h3>

          <label className="block text-sm text-slate-300">
            Service
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setStartAt(null);
                setStaffId(role === "staff" ? staffProfileId ?? "" : "");
              }}
              className={inputClass}
            >
              <option value="">Select a service…</option>
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.durationMinutes} min ·{" "}
                  {formatMoney(item.price, currency)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-300">
            Staff
            <select
              value={staffId}
              onChange={(event) => {
                setStaffId(event.target.value);
                setStartAt(null);
              }}
              disabled={role === "staff"}
              className={`${inputClass} disabled:opacity-70`}
            >
              <option value="">Select a staff member…</option>
              {eligibleStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            {role === "staff" ? (
              <span className="mt-1 block text-xs text-slate-500">
                Bookings are created under your own name.
              </span>
            ) : null}
          </label>

          <label className="block text-sm text-slate-300">
            Date
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => {
                setDate(event.target.value);
                setStartAt(null);
              }}
              className={inputClass}
            />
          </label>

          <div>
            <p className="text-sm text-slate-300">Time</p>
            {!serviceId || !staffId ? (
              <p className="mt-2 text-sm text-slate-500">
                Choose a service and staff member to see open times.
              </p>
            ) : slotsQuery.isLoading ? (
              <p className="mt-2 text-sm text-slate-400">Loading slots…</p>
            ) : (slotsQuery.data?.slots ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No open slots on {formatDayLabelClient(effectiveDate, timezone)}.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {(slotsQuery.data?.slots ?? []).map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => setStartAt(slot.startAt)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      startAt === slot.startAt
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            2. Customer
          </h3>

          {selectedCustomer ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
              <p className="font-medium text-slate-50">{selectedCustomer.name}</p>
              <p className="text-slate-400">
                {selectedCustomer.email ?? "No email"} ·{" "}
                {selectedCustomer.phone ?? "No phone"}
              </p>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="mt-2 text-xs text-emerald-400 hover:underline"
              >
                Choose another
              </button>
            </div>
          ) : (
            <>
              {role === "owner" ? (
                <div className="relative">
                  <label className="block text-sm text-slate-300">
                    Search existing customer
                    <input
                      value={customerQuery}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                      placeholder="Name, email or phone"
                      className={inputClass}
                    />
                  </label>
                  {customerSearch.data && customerSearch.data.length > 0 ? (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 text-sm shadow-xl">
                      {customerSearch.data.map((customer) => (
                        <li key={customer.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setCustomerQuery("");
                            }}
                            className="block w-full px-3 py-2 text-left hover:bg-slate-800"
                          >
                            <span className="text-slate-100">{customer.name}</span>
                            <span className="ml-2 text-xs text-slate-500">
                              {customer.email ?? customer.phone ?? ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <p className="text-xs uppercase tracking-wide text-slate-500">
                {role === "owner" ? "Or create a new one" : "New customer"}
              </p>
              <label className="block text-sm text-slate-300">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm text-slate-300">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm text-slate-300">
                Phone
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <button
            type="button"
            onClick={submit}
            disabled={createMutation.isPending}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMutation.isPending ? "Creating…" : "Create booking"}
          </button>
        </section>
      </div>
    </div>
  );
}
