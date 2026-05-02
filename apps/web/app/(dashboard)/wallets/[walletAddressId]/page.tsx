import { notFound } from "next/navigation";
import { getWallet, archiveWallet, runWalletScreening, runOnChainRiskChecksForWallet } from "@/lib/onchain/server";
import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { getMockProviderWarning } from "@/lib/onchain/providers/provider-factory";
import { maskWalletAddress } from "@/lib/onchain/masking";
import Link from "next/link";

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ walletAddressId: string }>;
}) {
  const { walletAddressId } = await params;
  const context = await requirePermission("onchain:read");
  const wallet = await getWallet(walletAddressId);

  if (!wallet) {
    notFound();
  }

  const canWrite = hasPermission(context.membership.role, "onchain:write");
  const canScreen = hasPermission(context.membership.role, "onchain:screen");
  const canImport = hasPermission(context.membership.role, "onchain:import");
  const mockWarning = getMockProviderWarning();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {wallet.network} Wallet
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-500">{maskWalletAddress(wallet.address)}</p>
          {wallet.label && <p className="text-sm text-slate-600">{wallet.label}</p>}
        </div>
        <Link href="/wallets" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to wallets
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Linked Entities */}
          <Card title="Linked To">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {wallet.customerProfile && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</dt>
                  <dd>
                    <Link href={`/customers/${wallet.customerProfile.id}`} className="text-blue-600 hover:underline">
                      {wallet.customerProfile.firstName} {wallet.customerProfile.lastName}
                    </Link>
                  </dd>
                </div>
              )}
              {wallet.businessProfile && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Business</dt>
                  <dd>
                    <Link href={`/businesses/${wallet.businessProfile.id}`} className="text-blue-600 hover:underline">
                      {wallet.businessProfile.legalName}
                    </Link>
                  </dd>
                </div>
              )}
              {wallet.complianceCase && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Case</dt>
                  <dd>
                    <Link href={`/cases/${wallet.complianceCase.id}`} className="text-blue-600 hover:underline">
                      {wallet.complianceCase.title}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Screening Runs */}
          <Card title={`Screening Runs (${wallet.screeningRuns.length})`}>
            {wallet.screeningRuns.length === 0 ? (
              <p className="text-sm text-slate-500">No screening runs.</p>
            ) : (
              <ul className="space-y-3">
                {wallet.screeningRuns.map((sr) => (
                  <li key={sr.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{sr.provider}</span>
                      <RiskLevelBadge level={sr.riskLevel} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Score: {sr.riskScore ?? "N/A"} · {new Date(sr.screenedAt).toLocaleString()}
                    </p>
                    {sr.summary && <p className="mt-1 text-xs text-slate-500">{sr.summary}</p>}
                    {sr.categoriesJson && (
                      <p className="mt-1 text-xs text-slate-500">
                        Categories: {JSON.parse(sr.categoriesJson).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* On-Chain Transactions */}
          <Card title={`On-Chain Transactions (${wallet.onChainTransactions.length})`}>
            {wallet.onChainTransactions.length === 0 ? (
              <p className="text-sm text-slate-500">No on-chain transactions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-4">Tx Hash</th>
                      <th className="pb-2 pr-4">Direction</th>
                      <th className="pb-2 pr-4">Asset</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Block Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.onChainTransactions.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-mono">{maskWalletAddress(t.txHash)}</td>
                        <td className="py-2 pr-4">{t.direction}</td>
                        <td className="py-2 pr-4">{t.assetSymbol}</td>
                        <td className="py-2 pr-4">{t.amount.toString()}</td>
                        <td className="py-2 pr-4">{new Date(t.blockTime).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Risk Signals */}
          <Card title={`Risk Signals (${wallet.riskSignals.length})`}>
            {wallet.riskSignals.length === 0 ? (
              <p className="text-sm text-slate-500">No risk signals.</p>
            ) : (
              <ul className="space-y-3">
                {wallet.riskSignals.map((rs) => (
                  <li key={rs.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{rs.title}</span>
                      <SeverityBadge severity={rs.severity} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Rule: {rs.ruleId}</p>
                    <p className="mt-1 text-sm text-slate-600">{rs.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card title="Actions">
            {canScreen && (
              <>
                {mockWarning.showWarning && (
                  <div className={`mb-3 rounded px-2 py-1 text-xs ${mockWarning.message.includes("DANGER") ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {mockWarning.message}
                  </div>
                )}
                <form action={async () => {
                  "use server";
                  await runWalletScreening(walletAddressId);
                }} className="mb-2">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Run Screening
                  </button>
                </form>
                <form action={async () => {
                  "use server";
                  await runOnChainRiskChecksForWallet(walletAddressId);
                }} className="mb-2">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Run Risk Checks
                  </button>
                </form>
              </>
            )}
            {canImport && (
              <div className="mb-2 space-y-2">
                <Link
                  href="/wallets/screening-import"
                  className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Import Screening CSV
                </Link>
                <Link
                  href="/wallets/transactions-import"
                  className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Import Transactions CSV
                </Link>
              </div>
            )}
            {canWrite && (
              <form action={async () => {
                "use server";
                await archiveWallet(walletAddressId);
              }}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Archive Wallet
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
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

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    INFO: "bg-blue-50 text-blue-700",
    LOW: "bg-green-50 text-green-700",
    MEDIUM: "bg-yellow-50 text-yellow-700",
    HIGH: "bg-orange-50 text-orange-700",
    CRITICAL: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[severity] ?? "bg-slate-50 text-slate-700"}`}>
      {severity}
    </span>
  );
}
