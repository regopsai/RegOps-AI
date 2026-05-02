import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { prisma } from "@regops-ai/database";
import { maskWalletAddress } from "@/lib/onchain/masking";
import Link from "next/link";
import { DocumentUpload } from "../../components/document-upload";
import { DocumentList } from "../../components/document-list";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const context = await requirePermission("cases:read");
  const canUpload = hasPermission(context.membership.role, "documents:upload");
  const canArchive = hasPermission(context.membership.role, "documents:archive");

  const customer = await prisma.customerProfile.findFirst({
    where: { id: customerId, organizationId: context.organization.id, deletedAt: null },
    include: {
      complianceCases: {
        orderBy: { openedAt: "desc" },
        take: 10,
        include: { assignedTo: { select: { name: true, email: true } } },
      },
      transactions: { orderBy: { occurredAt: "desc" }, take: 10, include: { riskSignals: { orderBy: { createdAt: "desc" }, take: 5 } } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, include: { uploadedBy: { select: { id: true, name: true, email: true } } } },
      riskSignals: { orderBy: { createdAt: "desc" }, take: 20 },
      walletAddresses: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { screeningRuns: { orderBy: { screenedAt: "desc" }, take: 1 } } },
    },
  });

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {customer.email ?? "No email"} · {customer.phone ?? "No phone"}
          </p>
        </div>
        <Link
          href="/customers"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to customers
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileSection title="Profile">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Nationality</dt><dd>{customer.nationality ?? "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Residence</dt><dd>{customer.countryOfResidence ?? "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Date of Birth</dt><dd>{customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString() : "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt><dd>{customer.status}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk Level</dt><dd>{customer.riskLevel}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt><dd>{new Date(customer.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </ProfileSection>

          <ProfileSection title={`Cases (${customer.complianceCases.length})`}>
            {customer.complianceCases.length === 0 ? (
              <p className="text-sm text-slate-500">No cases.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {customer.complianceCases.map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <Link href={`/cases/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">{c.title}</Link>
                    <span className="ml-2 text-xs text-slate-500">{c.status} · {new Date(c.openedAt).toLocaleDateString()}</span>
                    {c.assignedTo && <span className="ml-1 text-xs text-slate-400">· {c.assignedTo.name ?? c.assignedTo.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          <ProfileSection title={`Transactions (${customer.transactions.length})`}>
            {customer.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No transactions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-4">Reference</th>
                      <th className="pb-2 pr-4">Direction</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Counterparty</th>
                      <th className="pb-2 pr-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.transactions.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
                            {t.externalReference ?? "—"}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{t.direction}</td>
                        <td className="py-2 pr-4">{t.amount.toString()} {t.currency}</td>
                        <td className="py-2 pr-4">{t.counterpartyName ?? "—"}</td>
                        <td className="py-2 pr-4">{new Date(t.occurredAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ProfileSection>

          <ProfileSection title={`Wallets (${customer.walletAddresses.length})`}>
            {customer.walletAddresses.length === 0 ? (
              <p className="text-sm text-slate-500">No wallets linked.</p>
            ) : (
              <ul className="space-y-3">
                {customer.walletAddresses.map((w) => (
                  <li key={w.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <Link href={`/wallets/${w.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        {w.network} {maskWalletAddress(w.address)}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        (w.screeningRuns[0]?.riskLevel ?? "UNKNOWN") === "CRITICAL" ? "bg-red-50 text-red-700" :
                        (w.screeningRuns[0]?.riskLevel ?? "UNKNOWN") === "HIGH" ? "bg-orange-50 text-orange-700" :
                        (w.screeningRuns[0]?.riskLevel ?? "UNKNOWN") === "MEDIUM" ? "bg-yellow-50 text-yellow-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>{w.screeningRuns[0]?.riskLevel ?? "UNKNOWN"}</span>
                    </div>
                    {w.label && <p className="text-xs text-slate-500">{w.label}</p>}
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          <ProfileSection title={`Documents (${customer.documents.length})`}>
            {canUpload && (
              <DocumentUpload entityType="customer" entityId={customerId} />
            )}
            <div className="mt-3">
              <DocumentList
                documents={customer.documents}
                canArchive={canArchive}
              />
            </div>
          </ProfileSection>
        </div>

        <div className="space-y-6">
          <ProfileSection title={`Risk Signals (${customer.riskSignals.length})`}>
            {customer.riskSignals.length === 0 ? (
              <p className="text-sm text-slate-500">None.</p>
            ) : (
              <ul className="space-y-3">
                {customer.riskSignals.map((rs) => (
                  <li key={rs.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{rs.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        rs.severity === "CRITICAL" ? "bg-red-50 text-red-700" :
                        rs.severity === "HIGH" ? "bg-orange-50 text-orange-700" :
                        rs.severity === "MEDIUM" ? "bg-yellow-50 text-yellow-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>{rs.severity}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{rs.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
