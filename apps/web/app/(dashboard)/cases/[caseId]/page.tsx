import { notFound } from "next/navigation";
import { getCase, changeCaseStatus, assignCase, updateCase, addCaseNote, getCaseAuditEvents, runCaseRiskChecks, makeFinalDecision, getApprovalDecisions } from "@/lib/cases/server";
import { generateRiskMemo, acceptRiskMemo } from "@/lib/ai/server";
import { requirePermission } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/rbac";
import { prisma } from "@regops-ai/database";
import { getMockProviderWarning } from "@regops-ai/ai";
import Link from "next/link";
import { DocumentUpload } from "../../components/document-upload";
import { DocumentList } from "../../components/document-list";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const context = await requirePermission("cases:read");
  const caseData = await getCase(caseId);

  if (!caseData) {
    notFound();
  }

  const canUpdate = hasPermission(context.membership.role, "cases:update");
  const canAssign = hasPermission(context.membership.role, "cases:assign");
  const canUpload = hasPermission(context.membership.role, "documents:upload");
  const canImport = hasPermission(context.membership.role, "transactions:import");
  const canRunRiskChecks = hasPermission(context.membership.role, "cases:update");
  const canArchive = hasPermission(context.membership.role, "documents:archive");
  const canGenerateMemo = hasPermission(context.membership.role, "ai:risk_memo");
  const canMakeFinalDecision = hasPermission(context.membership.role, "cases:final_decision");
  const mockWarning = getMockProviderWarning();
  const isTerminal = ["APPROVED", "REJECTED", "CLOSED"].includes(caseData.status);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: context.organization.id, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const auditEvents = await getCaseAuditEvents(caseId);
  const approvalDecisions = await getApprovalDecisions(caseId);

  const documents = await prisma.document.findMany({
    where: { organizationId: context.organization.id, complianceCaseId: caseId, deletedAt: null },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const riskMemos = await prisma.riskMemo.findMany({
    where: { organizationId: context.organization.id, complianceCaseId: caseId },
    orderBy: { createdAt: "desc" },
    include: { acceptedBy: { select: { id: true, name: true, email: true } } },
  });

  const latestAgentRun = await prisma.agentRun.findFirst({
    where: { organizationId: context.organization.id, complianceCaseId: caseId, agentType: "RISK_MEMO" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {caseData.title}
            </h1>
            <CaseStatusBadge status={caseData.status} />
            <RiskLevelBadge level={caseData.riskLevel} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Opened by {caseData.openedBy.name ?? caseData.openedBy.email} on{" "}
            {new Date(caseData.openedAt).toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/cases"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to cases
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Profile Summary */}
          {caseData.customerProfile && (
            <ProfileCard title="Individual Customer">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
                  <dd>{caseData.customerProfile.firstName} {caseData.customerProfile.lastName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
                  <dd>{caseData.customerProfile.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt>
                  <dd>{caseData.customerProfile.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Nationality</dt>
                  <dd>{caseData.customerProfile.nationality ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Residence</dt>
                  <dd>{caseData.customerProfile.countryOfResidence ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Profile Status</dt>
                  <dd>{caseData.customerProfile.status}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk Level</dt>
                  <dd>{caseData.customerProfile.riskLevel}</dd>
                </div>
              </dl>
            </ProfileCard>
          )}

          {caseData.businessProfile && (
            <ProfileCard title="Business Profile">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Legal Name</dt>
                  <dd>{caseData.businessProfile.legalName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Trading Name</dt>
                  <dd>{caseData.businessProfile.tradingName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Registration</dt>
                  <dd>{caseData.businessProfile.registrationNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Incorporation</dt>
                  <dd>{caseData.businessProfile.incorporationCountry ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Operating</dt>
                  <dd>{caseData.businessProfile.operatingCountry ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Industry</dt>
                  <dd>{caseData.businessProfile.industry ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
                  <dd>{caseData.businessProfile.status}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk Level</dt>
                  <dd>{caseData.businessProfile.riskLevel}</dd>
                </div>
              </dl>
            </ProfileCard>
          )}

          {/* Risk Signals */}
          <Card title={`Risk Signals (${caseData.riskSignals.length})`}>
            {caseData.riskSignals.length === 0 ? (
              <p className="text-sm text-slate-500">No risk signals.</p>
            ) : (
              <ul className="space-y-3">
                {caseData.riskSignals.map((rs) => (
                  <li key={rs.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{rs.title}</span>
                      <SeverityBadge severity={rs.severity} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{rs.description}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      Rule: {rs.ruleId} · {new Date(rs.createdAt).toLocaleDateString()}
                    </div>
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

          {/* Transactions */}
          <Card title={`Transactions (${caseData.transactions.length})`}>
            <div className="mb-3 flex items-center gap-2">
              {canImport && (
                <Link
                  href="/transactions/import"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Import Transactions
                </Link>
              )}
              {canRunRiskChecks && (
                <form action={async () => {
                  "use server";
                  await runCaseRiskChecks(caseId);
                }}>
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Run Risk Checks
                  </button>
                </form>
              )}
            </div>
            {caseData.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No transactions linked.</p>
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
                    {caseData.transactions.map((t) => (
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
          </Card>

          {/* Documents */}
          <Card title={`Documents (${documents.length})`}>
            {canUpload && (
              <DocumentUpload entityType="case" entityId={caseId} />
            )}
            <div className="mt-3">
              <DocumentList
                documents={documents}
                canArchive={canArchive}
              />
            </div>
          </Card>

          {/* AI Risk Memo */}
          <Card title="AI Risk Memo">
            {mockWarning.showWarning && (
              <div className={`mb-3 rounded px-2 py-1 text-xs ${mockWarning.message.includes("DANGER") || mockWarning.message.includes("production") ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                {mockWarning.message}
              </div>
            )}
            <div className="mb-3 space-y-2">
              {canGenerateMemo && (
                <form action={async () => {
                  "use server";
                  await generateRiskMemo(caseId);
                }}>
                  <button
                    type="submit"
                    className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Generate Risk Memo
                  </button>
                </form>
              )}
              {latestAgentRun?.status === "RUNNING" && (
                <p className="text-xs text-amber-600">Generating risk memo...</p>
              )}
              {latestAgentRun?.status === "FAILED" && (
                <p className="text-xs text-red-600">Last generation failed. You can retry.</p>
              )}
              <p className="text-xs text-slate-500">
                AI memo is advisory. Human compliance decision is required.
              </p>
            </div>

            {riskMemos.length === 0 ? (
              <p className="text-sm text-slate-500">No risk memos generated yet.</p>
            ) : (
              <div className="space-y-4">
                {riskMemos.map((memo) => (
                  <div key={memo.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {new Date(memo.createdAt).toLocaleString()}
                      </span>
                      <RecommendedActionBadge action={memo.recommendedAction} />
                    </div>

                    <div className="mt-2 space-y-2 text-sm">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Executive Summary</span>
                        <p className="text-slate-700">{memo.executiveSummary}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Profile Summary</span>
                        <p className="text-slate-700">{memo.profileSummary}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Document Review</span>
                        <p className="text-slate-700">{memo.documentReview}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Transaction Review</span>
                        <p className="text-slate-700">{memo.transactionReview}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk Signals</span>
                        <p className="text-slate-700">{memo.riskSignalsSummary}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Missing Information</span>
                        <p className="text-slate-700">{memo.missingInformation}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Limitations</span>
                        <p className="text-slate-700">{memo.limitations}</p>
                      </div>
                      {memo.evidenceReferencesJson && (
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence References</span>
                          <ul className="mt-1 space-y-1">
                            {JSON.parse(memo.evidenceReferencesJson).map((ref: { type: string; id: string; label: string; relevance: string }) => (
                              <li key={ref.id} className="text-xs text-slate-600">
                                [{ref.type}] {ref.label} — {ref.relevance}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {memo.acceptedAt ? (
                      <div className="mt-3 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                        Accepted by {memo.acceptedBy?.name ?? memo.acceptedBy?.email} on{" "}
                        {new Date(memo.acceptedAt).toLocaleString()}
                      </div>
                    ) : canUpdate ? (
                      <div className="mt-3 flex items-center gap-2">
                        <form action={async () => {
                          "use server";
                          await acceptRiskMemo(memo.id, false);
                        }}>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Accept Memo
                          </button>
                        </form>
                        <form action={async () => {
                          "use server";
                          await acceptRiskMemo(memo.id, true);
                        }}>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Accept & Add to Notes
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Notes */}
          <Card title={`Notes (${caseData.notes.length})`}>
            {canUpdate && (
              <form action={async (formData: FormData) => {
                "use server";
                await addCaseNote(caseId, formData);
              }} className="mb-4 space-y-2">
                <textarea
                  name="body"
                  rows={3}
                  required
                  placeholder="Add a note..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <select name="visibility" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                    <option value="INTERNAL">Internal</option>
                    <option value="AUDITOR_VISIBLE">Auditor Visible</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Add Note
                  </button>
                </div>
              </form>
            )}
            {caseData.notes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {caseData.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{n.author.name ?? n.author.email}</span>
                      <span>{n.visibility} · {new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card title="Actions">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Assigned To</span>
                <p className="mt-1">{caseData.assignedTo?.name ?? caseData.assignedTo?.email ?? "Unassigned"}</p>
              </div>

              {canAssign && (
                <form action={async (formData: FormData) => {
                  "use server";
                  const userId = formData.get("assignedToUserId") as string;
                  await assignCase(caseId, userId || null);
                }} className="space-y-2">
                  <select
                    name="assignedToUserId"
                    defaultValue={caseData.assignedToUserId ?? ""}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m: { user: { id: string; name: string | null; email: string } }) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name ?? m.user.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Assign
                  </button>
                </form>
              )}

              {canUpdate && (
                <form action={async (formData: FormData) => {
                  "use server";
                  const status = formData.get("status") as string;
                  await changeCaseStatus(caseId, status as "OPEN" | "IN_REVIEW" | "ESCALATED" | "CLOSED");
                }} className="space-y-2">
                  <select
                    name="status"
                    defaultValue={caseData.status}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="ESCALATED">ESCALATED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Update Status
                  </button>
                </form>
              )}

              {canUpdate && (
                <form action={async (formData: FormData) => {
                  "use server";
                  await updateCase(caseId, formData);
                }} className="space-y-2 border-t border-slate-100 pt-3">
                  <input
                    name="title"
                    defaultValue={caseData.title}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    name="description"
                    defaultValue={caseData.description ?? ""}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Update Details
                  </button>
                </form>
              )}
            </div>
          </Card>

          {/* Final Decision */}
          <Card title="Final Decision">
            {approvalDecisions.length > 0 && (
              <div className="mb-4 space-y-2">
                {approvalDecisions.map((d) => (
                  <div key={d.id} className="rounded-md border border-slate-200 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <DecisionBadge decision={d.decision} />
                      <span className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{d.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      By {d.reviewer.name ?? d.reviewer.email}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {isTerminal ? (
              <p className="text-sm text-slate-500">Case is in a terminal state. No further decisions allowed.</p>
            ) : canMakeFinalDecision ? (
              <form action={async (formData: FormData) => {
                "use server";
                await makeFinalDecision(caseId, formData);
              }} className="space-y-2">
                <select
                  name="decision"
                  required
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select decision...</option>
                  <option value="APPROVE">Approve</option>
                  <option value="REJECT">Reject</option>
                  <option value="ESCALATE">Escalate</option>
                  <option value="REQUEST_MORE_INFORMATION">Request More Information</option>
                  <option value="CLOSE_NO_ACTION">Close (No Action)</option>
                </select>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  placeholder="Reason for decision..."
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Submit Final Decision
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">No final decisions yet.</p>
            )}
          </Card>

          {/* Audit Timeline */}
          <Card title="Activity">
            {auditEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No activity recorded.</p>
            ) : (
              <ul className="space-y-2">
                {auditEvents.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="font-medium text-slate-700">{e.action}</span>
                    <span className="ml-1 text-xs text-slate-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                    {e.metadataJson && (
                      <pre className="mt-1 max-h-20 overflow-auto rounded bg-slate-50 p-1 text-xs text-slate-600">
                        {JSON.stringify(JSON.parse(e.metadataJson), null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
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

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
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
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-50 text-slate-700"}`}>
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

function RecommendedActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    LOW_RISK_REVIEW: "bg-green-50 text-green-700",
    MEDIUM_RISK_REVIEW: "bg-yellow-50 text-yellow-700",
    HIGH_RISK_ESCALATION: "bg-red-50 text-red-700",
    REQUEST_MORE_INFORMATION: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[action] ?? "bg-slate-50 text-slate-700"}`}>
      {action}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const colors: Record<string, string> = {
    APPROVE: "bg-green-50 text-green-700",
    REJECT: "bg-gray-50 text-gray-700",
    ESCALATE: "bg-red-50 text-red-700",
    REQUEST_MORE_INFORMATION: "bg-blue-50 text-blue-700",
    CLOSE_NO_ACTION: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[decision] ?? "bg-slate-50 text-slate-700"}`}>
      {decision}
    </span>
  );
}
