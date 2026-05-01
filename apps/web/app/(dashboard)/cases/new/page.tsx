import { requirePermission } from "@/lib/auth/server";
import { createCase } from "@/lib/cases/server";
import { prisma } from "@regops-ai/database";
import Link from "next/link";
import { SubjectSelector } from "./subject-selector";

export default async function NewCasePage() {
  const context = await requirePermission("cases:create");

  const customers = await prisma.customerProfile.findMany({
    where: { organizationId: context.organization.id, deletedAt: null },
    orderBy: { lastName: "asc" },
  });

  const businesses = await prisma.businessProfile.findMany({
    where: { organizationId: context.organization.id, deletedAt: null },
    orderBy: { legalName: "asc" },
  });

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: context.organization.id, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Case</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a new compliance case in {context.organization.name}
        </p>
      </div>

      <form
        action={createCase}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        <SubjectSelector customers={customers} businesses={businesses} />

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            name="title"
            type="text"
            required
            maxLength={200}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            name="description"
            rows={4}
            maxLength={5000}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Risk Level <span className="text-red-500">*</span>
          </label>
          <select
            name="riskLevel"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select risk level</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Assigned To
          </label>
          <select
            name="assignedToUserId"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map(
              (m: {
                user: { id: string; name: string | null; email: string };
              }) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name ?? m.user.email}
                </option>
              )
            )}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create Case
          </button>
          <Link
            href="/cases"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
