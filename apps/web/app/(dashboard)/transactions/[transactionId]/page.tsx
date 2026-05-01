import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { getTransactionService } from "@/lib/transactions/transaction-service";
import Link from "next/link";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const context = await requirePermission("transactions:read");

  const transaction = await getTransactionService(
    {
      userId: context.user.id,
      organizationId: context.organization.id,
      role: context.membership.role,
    },
    transactionId
  );

  if (!transaction) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {transaction.externalReference ?? "Transaction"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {transaction.transactionType ?? "Unknown type"} ·{" "}
            {new Date(transaction.occurredAt).toLocaleString()}
          </p>
        </div>
        <Link
          href="/transactions"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to transactions
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Transaction Details">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Direction</dt>
                <dd>{transaction.direction}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</dt>
                <dd className="font-medium">
                  {transaction.amount.toString()} {transaction.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Counterparty</dt>
                <dd>{transaction.counterpartyName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Account</dt>
                <dd>{transaction.counterpartyAccount ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Country</dt>
                <dd>{transaction.counterpartyCountry ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment Rail</dt>
                <dd>{transaction.paymentRail ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</dt>
                <dd>{transaction.description ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Import Batch</dt>
                <dd>{transaction.transactionImportBatch?.fileName ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card title={`Risk Signals (${transaction.riskSignals.length})`}>
            {transaction.riskSignals.length === 0 ? (
              <p className="text-sm text-slate-500">No risk signals.</p>
            ) : (
              <ul className="space-y-3">
                {transaction.riskSignals.map((rs) => (
                  <li key={rs.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{rs.title}</span>
                      <SeverityBadge severity={rs.severity} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{rs.description}</p>
                    <div className="mt-1 text-xs text-slate-500">Rule: {rs.ruleId}</div>
                    {rs.evidenceJson && (
                      <pre className="mt-2 max-h-24 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                        {JSON.stringify(JSON.parse(rs.evidenceJson), null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Linked To">
            <div className="space-y-3 text-sm">
              {transaction.customerProfile && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</span>
                  <p>
                    <Link href={`/customers/${transaction.customerProfile.id}`} className="text-blue-600 hover:underline">
                      {transaction.customerProfile.firstName} {transaction.customerProfile.lastName}
                    </Link>
                  </p>
                </div>
              )}
              {transaction.businessProfile && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Business</span>
                  <p>
                    <Link href={`/businesses/${transaction.businessProfile.id}`} className="text-blue-600 hover:underline">
                      {transaction.businessProfile.legalName}
                    </Link>
                  </p>
                </div>
              )}
              {transaction.complianceCase && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Case</span>
                  <p>
                    <Link href={`/cases/${transaction.complianceCase.id}`} className="text-blue-600 hover:underline">
                      {transaction.complianceCase.title}
                    </Link>
                  </p>
                </div>
              )}
              {!transaction.customerProfile && !transaction.businessProfile && !transaction.complianceCase && (
                <p className="text-slate-500">No linked entity.</p>
              )}
            </div>
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
