"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import type { ServiceDto, StaffDto } from "@/lib/types";
import Dialog from "@/components/dashboard/dialog";

const emptyForm = {
  name: "",
  description: "",
  durationMinutes: 30,
  bufferMinutes: 0,
  priceMajor: "",
  staffIds: [] as string[],
  isActive: true,
};

type FormState = typeof emptyForm;

function ServiceForm({
  initial,
  staff,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial: FormState;
  staff: StaffDto[];
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <label className="block text-sm text-slate-300">
        Name
        <input
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <label className="block text-sm text-slate-300">
        Description
        <textarea
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm text-slate-300">
          Duration (min)
          <input
            type="number"
            min={15}
            step={5}
            value={form.durationMinutes}
            onChange={(event) => set("durationMinutes", Number(event.target.value))}
            required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="text-sm text-slate-300">
          Buffer (min)
          <input
            type="number"
            min={0}
            step={5}
            value={form.bufferMinutes}
            onChange={(event) => set("bufferMinutes", Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="text-sm text-slate-300">
          Price
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.priceMajor}
            onChange={(event) => set("priceMajor", event.target.value)}
            placeholder="0.00"
            required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">Stored as integer paisa (price × 100).</p>

      <fieldset className="text-sm text-slate-300">
        <legend className="mb-2">Staff who can perform this service</legend>
        {staff.length === 0 ? (
          <p className="text-xs text-slate-500">No staff yet — you can assign later.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {staff.map((member) => {
              const checked = form.staffIds.includes(member.id);
              return (
                <label
                  key={member.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 ${
                    checked
                      ? "border-emerald-600 bg-emerald-600/10 text-emerald-300"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      set(
                        "staffIds",
                        checked
                          ? form.staffIds.filter((id) => id !== member.id)
                          : [...form.staffIds, member.id]
                      )
                    }
                  />
                  {member.name}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => set("isActive", event.target.checked)}
        />
        Active (visible to customers)
      </label>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; service: ServiceDto } | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: () => apiFetch<ServiceDto[]>("/api/services"),
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch<StaffDto[]>("/api/staff"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services"] });

  const createMutation = useMutation({
    mutationFn: (form: FormState) =>
      apiFetch<ServiceDto>("/api/services", {
        method: "POST",
        body: {
          name: form.name,
          description: form.description || undefined,
          durationMinutes: form.durationMinutes,
          bufferMinutes: form.bufferMinutes,
          price: Math.round(Number(form.priceMajor) * 100),
          staffIds: form.staffIds,
          isActive: form.isActive,
        },
      }),
    onSuccess: () => {
      setDialog(null);
      setFormError(null);
      invalidate();
    },
    onError: (error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FormState }) =>
      apiFetch<ServiceDto>(`/api/services/${id}`, {
        method: "PATCH",
        body: {
          name: form.name,
          description: form.description || undefined,
          durationMinutes: form.durationMinutes,
          bufferMinutes: form.bufferMinutes,
          price: Math.round(Number(form.priceMajor) * 100),
          staffIds: form.staffIds,
          isActive: form.isActive,
        },
      }),
    onSuccess: () => {
      setDialog(null);
      setFormError(null);
      invalidate();
    },
    onError: (error) => setFormError(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<ServiceDto>(`/api/services/${id}`, {
        method: "PATCH",
        body: { isActive },
      }),
    onSuccess: invalidate,
  });

  const services = servicesQuery.data ?? [];
  const staff = (staffQuery.data ?? []).filter((member) => member.isActive);
  const pending = createMutation.isPending || updateMutation.isPending;

  function toFormState(service?: ServiceDto): FormState {
    if (!service) return emptyForm;
    return {
      name: service.name,
      description: service.description ?? "",
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      priceMajor: (service.price / 100).toFixed(2),
      staffIds: service.staffIds,
      isActive: service.isActive,
    };
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Services</h2>
          <p className="mt-1 text-sm text-slate-400">
            What customers can book — duration, buffer, and price.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setDialog({ mode: "create" });
          }}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          + New service
        </button>
      </div>

      {servicesQuery.isLoading ? (
        <p className="text-slate-400">Loading services…</p>
      ) : servicesQuery.isError ? (
        <p className="text-rose-400">{servicesQuery.error.message}</p>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">No services yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first service to start taking bookings.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Buffer</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {services.map((service) => (
                <tr key={service.id} className="text-slate-200">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-50">{service.name}</p>
                    {service.description ? (
                      <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                        {service.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{service.durationMinutes} min</td>
                  <td className="px-4 py-3">
                    {service.bufferMinutes > 0 ? `${service.bufferMinutes} min` : "—"}
                  </td>
                  <td className="px-4 py-3">{formatMoney(service.price)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {service.staffIds.length === 0
                      ? "Any"
                      : service.staffIds
                          .map((id) => staff.find((member) => member.id === id)?.name ?? "?")
                          .join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        service.isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-slate-700/40 text-slate-400"
                      }`}
                    >
                      {service.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        onClick={() => {
                          setFormError(null);
                          setDialog({ mode: "edit", service });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                        onClick={() =>
                          toggleMutation.mutate({ id: service.id, isActive: !service.isActive })
                        }
                        disabled={toggleMutation.isPending}
                      >
                        {service.isActive ? "Hide" : "Show"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialog !== null}
        wide
        title={dialog?.mode === "edit" ? "Edit service" : "New service"}
        onClose={() => setDialog(null)}
      >
        <ServiceForm
          key={dialog?.mode === "edit" ? dialog.service.id : "create"}
          initial={toFormState(dialog?.mode === "edit" ? dialog.service : undefined)}
          staff={staff}
          pending={pending}
          error={formError}
          onCancel={() => setDialog(null)}
          onSubmit={(form) => {
            if (dialog?.mode === "edit") {
              updateMutation.mutate({ id: dialog.service.id, form });
            } else {
              createMutation.mutate(form);
            }
          }}
        />
      </Dialog>
    </div>
  );
}
