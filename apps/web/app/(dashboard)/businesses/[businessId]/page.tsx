import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { prisma } from "@regops-ai/database";
import Link from "next/link";
import { DocumentUpload } from "../../components/document-upload";
import { DocumentList } from "../../components/document-list";

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const context = await requirePermission("cases:read");
  const canUpload = hasPermission(context.membership.role, "documents:upload");
  const canArchive = hasPermission(context.membership.role, "documents:archive");

  const business = await prisma.businessProfile.findFirst({
    where: { id: businessId, organizationId: context.organization.id, deletedAt: null },
    include: {
      complianceCases: {
        orderBy: { openedAt: "desc" },
        take: 10,
        include: { assignedTo: { select: { name: true, email: true } } },
      },
      transactions: { orderBy: { occurredAt: "desc" }, take: 10 },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, include: { uploadedBy: { select: { id: true, name: true, email: true } } } },
      riskSignals: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!business) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{business.legalName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {business.tradingName ? `${business.tradingName} · ` : ""}
            {business.registrationNumber ?? "No registration number"}
          </p>
        </div>
        <Link
          href="/businesses"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to businesses
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileSection title="Profile">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Incorporation</dt><dd>{business.incorporationCountry ?? "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Operating</dt><dd>{business.operatingCountry ?? "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Industry</dt><dd>{business.industry ?? "—"}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt><dd>{business.status}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk Level</dt><dd>{business.riskLevel}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt><dd>{new Date(business.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </ProfileSection>

          <ProfileSection title={`Cases (${business.complianceCases.length})`}>
            {business.complianceCases.length === 0 ? (
              <p className="text-sm text-slate-500">No cases.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {business.complianceCases.map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <Link href={`/cases/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">{c.title}</Link>
                    <span className="ml-2 text-xs text-slate-500">{c.status} · {new Date(c.openedAt).toLocaleDateString()}</span>
                    {c.assignedTo && <span className="ml-1 text-xs text-slate-400">· {c.assignedTo.name ?? c.assignedTo.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          <ProfileSection title={`Transactions (${business.transactions.length})`}>
            {business.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No transactions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-4">Reference</th>
                      <th className="pb-2 pr-4">Direction</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {business.transactions.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">{t.externalReference ?? "—"}</td>
                        <td className="py-2 pr-4">{t.direction}</td>
                        <td className="py-2 pr-4">{t.amount.toString()} {t.currency}</td>
                        <td className="py-2 pr-4">{new Date(t.occurredAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ProfileSection>

          <ProfileSection title={`Documents (${business.documents.length})`}>
            {canUpload && (
              <DocumentUpload entityType="business" entityId={businessId} />
            )}
            <div className="mt-3">
              <DocumentList
                documents={business.documents}
                canArchive={canArchive}
              />
            </div>
          </ProfileSection>
        </div>

        <div className="space-y-6">
          <ProfileSection title={`Risk Signals (${business.riskSignals.length})`}>
            {business.riskSignals.length === 0 ? (
              <p className="text-sm text-slate-500">None.</p>
            ) : (
              <ul className="space-y-3">
                {business.riskSignals.map((rs) => (
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
