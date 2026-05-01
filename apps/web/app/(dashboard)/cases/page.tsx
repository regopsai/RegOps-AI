import { listCases } from "@/lib/cases/server";
import { requirePermission, getUserMemberships } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import Link from "next/link";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    riskLevel?: string;
    assignedTo?: string;
    subjectType?: string;
    search?: string;
  }>;
}) {
  const context = await requirePermission("cases:read");
  const params = await searchParams;

  const cases = await listCases({
    status: params.status as import("@regops-ai/database").CaseStatus,
    riskLevel: params.riskLevel as import("@regops-ai/database").RiskLevel,
    assignedToUserId: params.assignedTo,
    subjectType: params.subjectType as "individual" | "business" | "all",
    search: params.search,
  });

  const canCreate = hasPermission(context.membership.role, "cases:create");

  const statusOptions = ["OPEN", "IN_REVIEW", "ESCALATED", "CLOSED"];
  const riskOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"];

  const members = await getUserMemberships(context.user.id);
  const orgMembers = await (
    await import("@regops-ai/database")
  ).prisma.organizationMember.findMany({
    where: {
      organizationId: context.organization.id,
      status: "ACTIVE",
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-slate-600">
            Compliance cases in {context.organization.name}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/cases/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            New Case
          </Link>
        )}
      </div>

      <form className="flex flex-wrap gap-3">
        <input
          type="text"
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="Search cases, customers, businesses..."
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="riskLevel"
          defaultValue={params.riskLevel ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All risk levels</option>
          {riskOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          name="subjectType"
          defaultValue={params.subjectType ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All subjects</option>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
        </select>
        <select
          name="assignedTo"
          defaultValue={params.assignedTo ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All assignees</option>
          {orgMembers.map((m: { user: { id: string; name: string | null; email: string } }) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Filter
        </button>
        <Link
          href="/cases"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      {cases.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No cases found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Subject
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Risk
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Assigned
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Opened
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {c.customerProfile
                      ? `${c.customerProfile.firstName} ${c.customerProfile.lastName}`
                      : c.businessProfile?.legalName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <RiskLevelBadge level={c.riskLevel} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {c.assignedTo?.name ?? c.assignedTo?.email ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(c.openedAt).toLocaleDateString()}
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

function CaseStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-50 text-blue-700",
    IN_REVIEW: "bg-yellow-50 text-yellow-700",
    ESCALATED: "bg-red-50 text-red-700",
    APPROVED: "bg-green-50 text-green-700",
    REJECTED: "bg-gray-50 text-gray-700",
    CLOSED: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-50 text-slate-700"}`}
    >
      {status}
    </span>
  );
}

function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-green-50 text-green-700",
    MEDIUM: "bg-yellow-50 text-yellow-700",
    HIGH: "bg-orange-50 text-orange-700",
    CRITICAL: "bg-red-50 text-red-700",
    UNKNOWN: "bg-slate-50 text-slate-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[level] ?? "bg-slate-50 text-slate-700"}`}
    >
      {level}
    </span>
  );
}
