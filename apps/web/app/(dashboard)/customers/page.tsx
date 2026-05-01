import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@regops-ai/database";
import Link from "next/link";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; riskLevel?: string; q?: string }>;
}) {
  const context = await requirePermission("cases:read");
  const sp = await searchParams;

  const where: Record<string, unknown> = {
    organizationId: context.organization.id,
    deletedAt: null,
  };

  if (sp.status) {
    where.status = sp.status;
  }
  if (sp.riskLevel) {
    where.riskLevel = sp.riskLevel;
  }
  if (sp.q) {
    where.OR = [
      { firstName: { contains: sp.q, mode: "insensitive" } },
      { lastName: { contains: sp.q, mode: "insensitive" } },
      { email: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.customerProfile.findMany({
    where,
    orderBy: { lastName: "asc" },
    include: { _count: { select: { complianceCases: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by name or email..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="FROZEN">FROZEN</option>
            <option value="CLOSED">CLOSED</option>
          </select>
          <select
            name="riskLevel"
            defaultValue={sp.riskLevel ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All risk levels</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filter
          </button>
          <Link
            href="/customers"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </Link>
        </form>
      </div>

      {customers.length === 0 ? (
        <p className="text-sm text-slate-500">No customers found.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Risk</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Cases</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.riskLevel === "LOW" ? "bg-green-50 text-green-700" :
                      c.riskLevel === "MEDIUM" ? "bg-yellow-50 text-yellow-700" :
                      c.riskLevel === "HIGH" ? "bg-orange-50 text-orange-700" :
                      c.riskLevel === "CRITICAL" ? "bg-red-50 text-red-700" :
                      "bg-slate-50 text-slate-700"
                    }`}>{c.riskLevel}</span>
                  </td>
                  <td className="px-4 py-3">{c._count.complianceCases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
