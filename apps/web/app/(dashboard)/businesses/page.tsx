import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@regops-ai/database";
import Link from "next/link";

export default async function BusinessesPage({
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
      { legalName: { contains: sp.q, mode: "insensitive" } },
      { tradingName: { contains: sp.q, mode: "insensitive" } },
      { registrationNumber: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const businesses = await prisma.businessProfile.findMany({
    where,
    orderBy: { legalName: "asc" },
    include: { _count: { select: { complianceCases: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by name or registration..."
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
            href="/businesses"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </Link>
        </form>
      </div>

      {businesses.length === 0 ? (
        <p className="text-sm text-slate-500">No businesses found.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Legal Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Trading Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Risk</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Cases</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {businesses.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/businesses/${b.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                      {b.legalName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.tradingName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.riskLevel === "LOW" ? "bg-green-50 text-green-700" :
                      b.riskLevel === "MEDIUM" ? "bg-yellow-50 text-yellow-700" :
                      b.riskLevel === "HIGH" ? "bg-orange-50 text-orange-700" :
                      b.riskLevel === "CRITICAL" ? "bg-red-50 text-red-700" :
                      "bg-slate-50 text-slate-700"
                    }`}>{b.riskLevel}</span>
                  </td>
                  <td className="px-4 py-3">{b._count.complianceCases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
