import { listWallets } from "@/lib/onchain/server";
import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { maskWalletAddress } from "@/lib/onchain/masking";
import Link from "next/link";

export default async function WalletsPage() {
  const context = await requirePermission("onchain:read");
  const wallets = await listWallets();

  const canWrite = hasPermission(context.membership.role, "onchain:write");
  const canScreen = hasPermission(context.membership.role, "onchain:screen");
  const canImport = hasPermission(context.membership.role, "onchain:import");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Wallets</h1>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Link
              href="/wallets/new"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Add Wallet
            </Link>
          )}
          {canImport && (
            <Link
              href="/wallets/screening-import"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Import Screening
            </Link>
          )}
          {canImport && (
            <Link
              href="/wallets/transactions-import"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Import Transactions
            </Link>
          )}
        </div>
      </div>

      {wallets.length === 0 ? (
        <p className="text-sm text-slate-500">No wallets registered.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Network</th>
                <th className="pb-2 pr-4">Address</th>
                <th className="pb-2 pr-4">Label</th>
                <th className="pb-2 pr-4">Linked To</th>
                <th className="pb-2 pr-4">Latest Risk</th>
                <th className="pb-2 pr-4">Provider</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{w.network}</td>
                  <td className="py-2 pr-4 font-mono">{maskWalletAddress(w.address)}</td>
                  <td className="py-2 pr-4">{w.label ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {w.customerProfile
                      ? `${w.customerProfile.firstName} ${w.customerProfile.lastName}`
                      : w.businessProfile
                        ? w.businessProfile.legalName
                        : w.complianceCase
                          ? w.complianceCase.title
                          : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <RiskLevelBadge level={w.screeningRuns[0]?.riskLevel ?? "UNKNOWN"} />
                  </td>
                  <td className="py-2 pr-4">{w.screeningRuns[0]?.provider ?? "—"}</td>
                  <td className="py-2 pr-4">{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/wallets/${w.id}`} className="text-blue-600 hover:underline">
                      View
                    </Link>
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

function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-green-50 text-green-700",
    MEDIUM: "bg-yellow-50 text-yellow-700",
    HIGH: "bg-orange-50 text-orange-700",
    CRITICAL: "bg-red-50 text-red-700",
    UNKNOWN: "bg-slate-50 text-slate-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[level] ?? "bg-slate-50 text-slate-700"}`}>
      {level}
    </span>
  );
}
