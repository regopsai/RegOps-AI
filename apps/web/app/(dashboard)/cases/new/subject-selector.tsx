"use client";

import { useState } from "react";

export function SubjectSelector({
  customers,
  businesses,
}: {
  customers: { id: string; firstName: string; lastName: string; email: string | null }[];
  businesses: { id: string; legalName: string; registrationNumber: string | null }[];
}) {
  const [subjectType, setSubjectType] = useState("");

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Subject Type
        </label>
        <select
          value={subjectType}
          onChange={(e) => setSubjectType(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select subject type</option>
          <option value="individual">Individual Customer</option>
          <option value="business">Business</option>
        </select>
      </div>

      {subjectType === "individual" && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Customer
          </label>
          <select
            name="customerProfileId"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} ({c.email ?? "no email"})
              </option>
            ))}
          </select>
        </div>
      )}

      {subjectType === "business" && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Business
          </label>
          <select
            name="businessProfileId"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select business</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.legalName} ({b.registrationNumber ?? "no reg"})
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
