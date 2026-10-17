"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import type { CustomerDto } from "@/lib/types";

export default function CustomersView() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", term],
    queryFn: () =>
      apiFetch<CustomerDto[]>(
        term ? `/api/customers?q=${encodeURIComponent(term)}` : "/api/customers"
      ),
  });

  const customers = customersQuery.data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-50">Customers</h2>
        <p className="mt-1 text-sm text-slate-400">
          Search the people who book with you.
        </p>
      </div>

      <form
        className="mb-5 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, email or phone"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Search
        </button>
        {term ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setTerm("");
            }}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Clear
          </button>
        ) : null}
      </form>

      {customersQuery.isLoading ? (
        <p className="text-slate-400">Loading customers…</p>
      ) : customersQuery.isError ? (
        <p className="text-rose-400">{customersQuery.error.message}</p>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">No customers found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Preferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {customers.map((customer) => (
                <tr key={customer.id} className="text-slate-200">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="font-medium text-slate-50 hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {customer.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {customer.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-400">
                    {customer.preferredChannel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
