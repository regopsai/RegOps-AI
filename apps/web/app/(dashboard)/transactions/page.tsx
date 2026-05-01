import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { listTransactionsService } from "@/lib/transactions/transaction-service";
import Link from "next/link";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    direction?: string;
    currency?: string;
    country?: string;
    search?: string;
    customerId?: string;
    businessId?: string;
    caseId?: string;
  }>;
}) {
  const context = await requirePermission("transactions:read");
  const canImport = hasPermission(context.membership.role, "transactions:import");
  const params = await searchParams;

  const filters: Parameters<typeof listTransactionsService>[1] = {};
  if (params.direction === "INBOUND" || params.direction === "OUTBOUND") {
    filters.direction = params.direction;
  }
  if (params.currency) filters.currency = params.currency;
  if (params.country) filters.counterpartyCountry = params.country;
  if (params.search) filters.search = params.search;
  if (params.customerId) filters.customerProfileId = params.customerId;
  if (params.businessId) filters.businessProfileId = params.businessId;
  if (params.caseId) filters.complianceCaseId = params.caseId;

  const transactions = await listTransactionsService(
    {
      userId: context.user.id,
      organizationId: context.organization.id,
      role: context.membership.role,
    },
    filters
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <div className="flex items-center gap-3">
          {canImport && (
            <Link
              href="/transactions/import"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Import CSV
            </Link>
          )}
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="Search reference, counterparty, description..."
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select name="direction" defaultValue={params.direction ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All directions</option>
          <option value="INBOUND">INBOUND</option>
          <option value="OUTBOUND">OUTBOUND</option>
        </select>
        <input
          type="text"
          name="currency"
          defaultValue={params.currency ?? ""}
          placeholder="Currency"
          className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          name="country"
          defaultValue={params.country ?? ""}
          placeholder="Country"
          className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Filter
        </button>
        <Link href="/transactions" className="text-sm text-slate-500 hover:text-slate-900">
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Counterparty</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Linked To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                    {t.externalReference ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{new Date(t.occurredAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <DirectionBadge direction={t.direction} />
                </td>
                <td className="px-4 py-3 font-medium">
                  {t.amount.toString()} {t.currency}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.counterpartyName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{t.counterpartyCountry ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{t.transactionType ?? "—"}</td>
                <td className="px-4 py-3">
                  {t.customerProfile && (
                    <Link href={`/customers/${t.customerProfile.id}`} className="text-blue-600 hover:underline">
                      {t.customerProfile.firstName} {t.customerProfile.lastName}
                    </Link>
                  )}
                  {t.businessProfile && (
                    <Link href={`/businesses/${t.businessProfile.id}`} className="text-blue-600 hover:underline">
                      {t.businessProfile.legalName}
                    </Link>
                  )}
                  {t.complianceCase && (
                    <Link href={`/cases/${t.complianceCase.id}`} className="text-blue-600 hover:underline">
                      {t.complianceCase.title}
                    </Link>
                  )}
                  {!t.customerProfile && !t.businessProfile && !t.complianceCase && (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {transactions.length === 0 && (
        <p className="text-sm text-slate-500">No transactions found.</p>
      )}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const colors: Record<string, string> = {
    INBOUND: "bg-green-50 text-green-700",
    OUTBOUND: "bg-orange-50 text-orange-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[direction] ?? "bg-slate-50 text-slate-700"}`}>
      {direction}
    </span>
  );
}
