import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import PDFDocument from "pdfkit";

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

function assertPermission(ctx: ActorContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

export interface BuildEvidenceExportInput {
  complianceCaseId: string;
  format: "json" | "pdf";
}

export interface EvidenceExportData {
  exportMetadata: {
    exportVersion: string;
    generatedAt: string;
    generatedByUserId: string;
    organizationId: string;
    complianceCaseId: string;
    format: string;
    applicationName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  caseSummary: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    riskLevel: string;
    openedAt: string;
    closedAt: string | null;
    openedBy: { id: string; name: string | null; email: string } | null;
    assignedTo: { id: string; name: string | null; email: string } | null;
    createdAt: string;
    updatedAt: string;
  };
  subject:
    | {
        type: "customer";
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        nationality: string | null;
        countryOfResidence: string | null;
        status: string;
        riskLevel: string;
      }
    | {
        type: "business";
        id: string;
        legalName: string;
        tradingName: string | null;
        registrationNumber: string | null;
        incorporationCountry: string | null;
        operatingCountry: string | null;
        industry: string | null;
        status: string;
        riskLevel: string;
      }
    | null;
  documents: {
    id: string;
    type: string;
    status: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string | null;
    createdAt: string;
    uploadedByUserId: string;
  }[];
  transactions: {
    count: number;
    totalsByCurrency: Record<
      string,
      { inbound: string; outbound: string }
    >;
    rows: {
      id: string;
      externalReference: string | null;
      direction: string;
      amount: string;
      currency: string;
      counterpartyName: string | null;
      counterpartyAccount: string | null;
      counterpartyCountry: string | null;
      paymentRail: string | null;
      transactionType: string | null;
      occurredAt: string;
    }[];
  };
  riskSignals: {
    id: string;
    ruleId: string;
    title: string;
    description: string;
    severity: string;
    createdAt: string;
    evidenceSummary: string | null;
  }[];
  riskMemos: {
    latest: {
      id: string;
      recommendedAction: string;
      executiveSummary: string;
      profileSummary: string;
      documentReview: string;
      transactionReview: string;
      riskSignalsSummary: string;
      missingInformation: string;
      limitations: string;
      acceptedAt: string | null;
      acceptedByUserId: string | null;
      createdAt: string;
    } | null;
    historical: {
      id: string;
      recommendedAction: string;
      acceptedAt: string | null;
      createdAt: string;
      agentRunId: string | null;
    }[];
  };
  finalDecisions: {
    id: string;
    decision: string;
    reason: string;
    reviewerUserId: string;
    createdAt: string;
    evidenceSnapshotVersion: string | null;
  }[];
  caseNotes: {
    count: number;
    auditorVisible: {
      id: string;
      body: string;
      authorUserId: string;
      createdAt: string;
    }[];
    internal: {
      id: string;
      visibility: string;
      authorUserId: string;
      createdAt: string;
    }[];
  };
  auditTimeline: {
    action: string;
    actorUserId: string | null;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    metadataSummary: string | null;
  }[];
}

export function maskSensitiveValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

export function summarizeRiskSignalEvidence(evidenceJson: string | null | undefined): string | null {
  if (!evidenceJson) return null;
  try {
    const parsed = JSON.parse(evidenceJson);
    if (typeof parsed !== "object" || parsed === null) {
      return String(parsed).slice(0, 500);
    }
    const summary: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === "string") {
        summary[key] = val.length > 200 ? val.slice(0, 200) + "..." : val;
      } else if (typeof val === "number" || typeof val === "boolean") {
        summary[key] = val;
      } else if (Array.isArray(val)) {
        summary[key] = `Array(${val.length})`;
      } else {
        summary[key] = "[object]";
      }
    }
    const json = JSON.stringify(summary);
    return json.length > 1000 ? json.slice(0, 1000) + "..." : json;
  } catch {
    return (evidenceJson ?? "").slice(0, 500);
  }
}

export function summarizeAuditMetadata(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson);
    if (typeof parsed !== "object" || parsed === null) {
      return String(parsed).slice(0, 500);
    }
    const blockedKeys = new Set([
      "storageKey",
      "extractedText",
      "apiKey",
      "prompt",
      "rawResponse",
      "evidenceSnapshotJson",
      "fullContext",
    ]);
    const summary: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (blockedKeys.has(key)) {
        summary[key] = "[redacted]";
        continue;
      }
      if (typeof val === "string") {
        summary[key] = val.length > 300 ? val.slice(0, 300) + "..." : val;
      } else if (typeof val === "number" || typeof val === "boolean") {
        summary[key] = val;
      } else if (Array.isArray(val)) {
        summary[key] = `Array(${val.length})`;
      } else {
        summary[key] = "[object]";
      }
    }
    const json = JSON.stringify(summary);
    return json.length > 1000 ? json.slice(0, 1000) + "..." : json;
  } catch {
    return (metadataJson ?? "").slice(0, 500);
  }
}

function toDecimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toFixed(4);
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }
  return String(value);
}

export async function buildEvidenceExportService(
  ctx: ActorContext,
  input: BuildEvidenceExportInput
): Promise<EvidenceExportData> {
  assertPermission(ctx, "evidence:export");

  const caseRecord = await prisma.complianceCase.findFirst({
    where: { id: input.complianceCaseId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      customerProfile: true,
      businessProfile: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      openedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!caseRecord) {
    throw new Error("Case not found");
  }

  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId, deletedAt: null },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const [
    documents,
    transactions,
    riskSignals,
    riskMemos,
    approvalDecisions,
    caseNotes,
    auditEvents,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    prisma.riskSignal.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.riskMemo.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.approvalDecision.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.caseNote.findMany({
      where: { organizationId: ctx.organizationId, complianceCaseId: input.complianceCaseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { entityId: input.complianceCaseId },
          { metadataJson: { contains: `\"complianceCaseId\":\"${input.complianceCaseId}\"` } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const totalsByCurrency: Record<string, { inbound: string; outbound: string }> = {};
  for (const t of transactions) {
    const currency = t.currency.toUpperCase();
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = { inbound: "0.0000", outbound: "0.0000" };
    }
    const amountStr = toDecimalString(t.amount);
    if (t.direction === "INBOUND") {
      const current = parseFloat(totalsByCurrency[currency].inbound);
      totalsByCurrency[currency].inbound = (current + parseFloat(amountStr)).toFixed(4);
    } else {
      const current = parseFloat(totalsByCurrency[currency].outbound);
      totalsByCurrency[currency].outbound = (current + parseFloat(amountStr)).toFixed(4);
    }
  }

  const latestRiskMemo = riskMemos[0] ?? null;

  const exportData: EvidenceExportData = {
    exportMetadata: {
      exportVersion: "1.0",
      generatedAt: new Date().toISOString(),
      generatedByUserId: ctx.userId,
      organizationId: ctx.organizationId,
      complianceCaseId: input.complianceCaseId,
      format: input.format,
      applicationName: "RegOps AI",
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
    },
    caseSummary: {
      id: caseRecord.id,
      title: caseRecord.title,
      description: caseRecord.description,
      status: caseRecord.status,
      riskLevel: caseRecord.riskLevel,
      openedAt: caseRecord.openedAt.toISOString(),
      closedAt: caseRecord.closedAt?.toISOString() ?? null,
      openedBy: caseRecord.openedBy,
      assignedTo: caseRecord.assignedTo,
      createdAt: caseRecord.createdAt.toISOString(),
      updatedAt: caseRecord.updatedAt.toISOString(),
    },
    subject: caseRecord.customerProfile
      ? {
          type: "customer",
          id: caseRecord.customerProfile.id,
          firstName: caseRecord.customerProfile.firstName,
          lastName: caseRecord.customerProfile.lastName,
          email: caseRecord.customerProfile.email,
          phone: caseRecord.customerProfile.phone,
          nationality: caseRecord.customerProfile.nationality,
          countryOfResidence: caseRecord.customerProfile.countryOfResidence,
          status: caseRecord.customerProfile.status,
          riskLevel: caseRecord.customerProfile.riskLevel,
        }
      : caseRecord.businessProfile
        ? {
            type: "business",
            id: caseRecord.businessProfile.id,
            legalName: caseRecord.businessProfile.legalName,
            tradingName: caseRecord.businessProfile.tradingName,
            registrationNumber: caseRecord.businessProfile.registrationNumber,
            incorporationCountry: caseRecord.businessProfile.incorporationCountry,
            operatingCountry: caseRecord.businessProfile.operatingCountry,
            industry: caseRecord.businessProfile.industry,
            status: caseRecord.businessProfile.status,
            riskLevel: caseRecord.businessProfile.riskLevel,
          }
        : null,
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      originalFileName: d.originalFileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      checksumSha256: d.checksumSha256,
      createdAt: d.createdAt.toISOString(),
      uploadedByUserId: d.uploadedByUserId,
    })),
    transactions: {
      count: transactions.length,
      totalsByCurrency,
      rows: transactions.map((t) => ({
        id: t.id,
        externalReference: t.externalReference,
        direction: t.direction,
        amount: toDecimalString(t.amount),
        currency: t.currency.toUpperCase(),
        counterpartyName: t.counterpartyName,
        counterpartyAccount: maskSensitiveValue(t.counterpartyAccount),
        counterpartyCountry: t.counterpartyCountry,
        paymentRail: t.paymentRail,
        transactionType: t.transactionType,
        occurredAt: t.occurredAt.toISOString(),
      })),
    },
    riskSignals: riskSignals.map((rs) => ({
      id: rs.id,
      ruleId: rs.ruleId,
      title: rs.title,
      description: rs.description,
      severity: rs.severity,
      createdAt: rs.createdAt.toISOString(),
      evidenceSummary: summarizeRiskSignalEvidence(rs.evidenceJson),
    })),
    riskMemos: {
      latest: latestRiskMemo
        ? {
            id: latestRiskMemo.id,
            recommendedAction: latestRiskMemo.recommendedAction,
            executiveSummary: latestRiskMemo.executiveSummary,
            profileSummary: latestRiskMemo.profileSummary,
            documentReview: latestRiskMemo.documentReview,
            transactionReview: latestRiskMemo.transactionReview,
            riskSignalsSummary: latestRiskMemo.riskSignalsSummary,
            missingInformation: latestRiskMemo.missingInformation,
            limitations: latestRiskMemo.limitations,
            acceptedAt: latestRiskMemo.acceptedAt?.toISOString() ?? null,
            acceptedByUserId: latestRiskMemo.acceptedByUserId,
            createdAt: latestRiskMemo.createdAt.toISOString(),
          }
        : null,
      historical: riskMemos.map((m) => ({
        id: m.id,
        recommendedAction: m.recommendedAction,
        acceptedAt: m.acceptedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        agentRunId: m.agentRunId,
      })),
    },
    finalDecisions: approvalDecisions.map((ad) => ({
      id: ad.id,
      decision: ad.decision,
      reason: ad.reason,
      reviewerUserId: ad.reviewerUserId,
      createdAt: ad.createdAt.toISOString(),
      evidenceSnapshotVersion: (() => {
        try {
          const snap = JSON.parse(ad.evidenceSnapshotJson ?? "{}");
          return snap.snapshotVersion ?? null;
        } catch {
          return null;
        }
      })(),
    })),
    caseNotes: {
      count: caseNotes.length,
      auditorVisible: caseNotes
        .filter((n) => n.visibility === "AUDITOR_VISIBLE")
        .map((n) => ({
          id: n.id,
          body: n.body,
          authorUserId: n.authorUserId,
          createdAt: n.createdAt.toISOString(),
        })),
      internal: caseNotes
        .filter((n) => n.visibility === "INTERNAL")
        .map((n) => ({
          id: n.id,
          visibility: n.visibility,
          authorUserId: n.authorUserId,
          createdAt: n.createdAt.toISOString(),
        })),
    },
    auditTimeline: auditEvents.map((e) => ({
      action: e.action,
      actorUserId: e.actorUserId,
      entityType: e.entityType,
      entityId: e.entityId,
      createdAt: e.createdAt.toISOString(),
      metadataSummary: summarizeAuditMetadata(e.metadataJson),
    })),
  };

  return exportData;
}

export async function renderEvidenceExportJsonService(exportData: EvidenceExportData): Promise<Buffer> {
  const json = JSON.stringify(exportData, null, 2);
  return Buffer.from(json, "utf-8");
}

export async function renderEvidenceExportPdfService(exportData: EvidenceExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err: Error) => reject(err));

    const { exportMetadata, organization, caseSummary, subject, documents, transactions, riskSignals, riskMemos, finalDecisions, caseNotes, auditTimeline } = exportData;

    doc.fontSize(20).text("RegOps AI — Evidence Export Pack", 50, 50);
    doc.fontSize(10).text(`Generated: ${new Date(exportMetadata.generatedAt).toUTCString()}`, 50, 80);
    doc.text(`Case: ${caseSummary.title} (${caseSummary.id})`, 50, 95);
    doc.text(`Organization: ${organization.name}`, 50, 110);
    doc.moveDown(2);

    doc.fontSize(14).text("Organization", { underline: true });
    doc.fontSize(10).text(`Name: ${organization.name}`);
    doc.text(`Slug: ${organization.slug}`);
    doc.text(`Status: ${organization.status}`);
    doc.moveDown();

    doc.fontSize(14).text("Case Summary", { underline: true });
    doc.fontSize(10).text(`Title: ${caseSummary.title}`);
    if (caseSummary.description) doc.text(`Description: ${caseSummary.description}`);
    doc.text(`Status: ${caseSummary.status}`);
    doc.text(`Risk Level: ${caseSummary.riskLevel}`);
    doc.text(`Opened: ${new Date(caseSummary.openedAt).toUTCString()}`);
    if (caseSummary.closedAt) doc.text(`Closed: ${new Date(caseSummary.closedAt).toUTCString()}`);
    if (caseSummary.openedBy) doc.text(`Opened By: ${caseSummary.openedBy.name ?? caseSummary.openedBy.email}`);
    if (caseSummary.assignedTo) doc.text(`Assigned To: ${caseSummary.assignedTo.name ?? caseSummary.assignedTo.email}`);
    doc.moveDown();

    if (subject) {
      doc.fontSize(14).text("Subject", { underline: true });
      doc.fontSize(10);
      if (subject.type === "customer") {
        doc.text(`Type: Individual Customer`);
        doc.text(`Name: ${subject.firstName} ${subject.lastName}`);
        if (subject.email) doc.text(`Email: ${subject.email}`);
        if (subject.phone) doc.text(`Phone: ${subject.phone}`);
        if (subject.nationality) doc.text(`Nationality: ${subject.nationality}`);
        if (subject.countryOfResidence) doc.text(`Residence: ${subject.countryOfResidence}`);
        doc.text(`Status: ${subject.status}`);
        doc.text(`Risk Level: ${subject.riskLevel}`);
      } else {
        doc.text(`Type: Business`);
        doc.text(`Legal Name: ${subject.legalName}`);
        if (subject.tradingName) doc.text(`Trading Name: ${subject.tradingName}`);
        if (subject.registrationNumber) doc.text(`Registration: ${subject.registrationNumber}`);
        if (subject.incorporationCountry) doc.text(`Incorporation Country: ${subject.incorporationCountry}`);
        if (subject.operatingCountry) doc.text(`Operating Country: ${subject.operatingCountry}`);
        if (subject.industry) doc.text(`Industry: ${subject.industry}`);
        doc.text(`Status: ${subject.status}`);
        doc.text(`Risk Level: ${subject.riskLevel}`);
      }
      doc.moveDown();
    }

    doc.fontSize(14).text(`Documents (${documents.length})`, { underline: true });
    doc.fontSize(10);
    if (documents.length === 0) {
      doc.text("No documents.");
    } else {
      documents.forEach((d) => {
        doc.text(`• ${d.originalFileName} (${d.type}) — ${d.mimeType} — ${d.sizeBytes} bytes — SHA256: ${d.checksumSha256 ?? "n/a"}`);
      });
    }
    doc.moveDown();

    doc.fontSize(14).text(`Transactions (${transactions.count})`, { underline: true });
    doc.fontSize(10);
    if (transactions.count === 0) {
      doc.text("No transactions.");
    } else {
      doc.text("Totals by currency:");
      for (const [currency, totals] of Object.entries(transactions.totalsByCurrency)) {
        doc.text(`  ${currency}: Inbound ${totals.inbound} / Outbound ${totals.outbound}`);
      }
      doc.moveDown(0.5);
      doc.text(`Showing up to ${transactions.rows.length} transactions:`);
      transactions.rows.forEach((t) => {
        const line = [
          `• ${t.externalReference ?? "—"}`,
          t.direction,
          `${t.amount} ${t.currency}`,
          t.counterpartyName ?? "—",
          t.counterpartyAccount ? `Account: ${t.counterpartyAccount}` : null,
          t.occurredAt ? new Date(t.occurredAt).toUTCString() : null,
        ]
          .filter(Boolean)
          .join(" | ");
        doc.text(line);
      });
    }
    doc.moveDown();

    doc.fontSize(14).text(`Risk Signals (${riskSignals.length})`, { underline: true });
    doc.fontSize(10);
    if (riskSignals.length === 0) {
      doc.text("No risk signals.");
    } else {
      riskSignals.forEach((rs) => {
        doc.text(`• [${rs.severity}] ${rs.title} (Rule: ${rs.ruleId})`);
        doc.text(`  ${rs.description}`);
        if (rs.evidenceSummary) doc.text(`  Evidence: ${rs.evidenceSummary}`);
      });
    }
    doc.moveDown();

    doc.fontSize(14).text(`Risk Memos (${riskMemos.historical.length})`, { underline: true });
    doc.fontSize(10);
    if (riskMemos.latest) {
      doc.text(`Latest Memo: ${riskMemos.latest.id}`);
      doc.text(`Recommended Action: ${riskMemos.latest.recommendedAction}`);
      doc.text(`Accepted: ${riskMemos.latest.acceptedAt ? new Date(riskMemos.latest.acceptedAt).toUTCString() : "Not accepted"}`);
      doc.moveDown(0.5);
      doc.text("Executive Summary:");
      doc.text(riskMemos.latest.executiveSummary, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Profile Summary:");
      doc.text(riskMemos.latest.profileSummary, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Document Review:");
      doc.text(riskMemos.latest.documentReview, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Transaction Review:");
      doc.text(riskMemos.latest.transactionReview, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Risk Signals Summary:");
      doc.text(riskMemos.latest.riskSignalsSummary, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Missing Information:");
      doc.text(riskMemos.latest.missingInformation, { indent: 10 });
      doc.moveDown(0.5);
      doc.text("Limitations:");
      doc.text(riskMemos.latest.limitations, { indent: 10 });
    } else {
      doc.text("No risk memos.");
    }
    doc.moveDown();

    doc.fontSize(14).text(`Final Decisions (${finalDecisions.length})`, { underline: true });
    doc.fontSize(10);
    if (finalDecisions.length === 0) {
      doc.text("No final decisions.");
    } else {
      finalDecisions.forEach((d) => {
        doc.text(`• ${d.decision} — ${new Date(d.createdAt).toUTCString()}`);
        doc.text(`  Reason: ${d.reason}`);
        doc.text(`  Reviewer: ${d.reviewerUserId}`);
      });
    }
    doc.moveDown();

    doc.fontSize(14).text(`Case Notes (${caseNotes.count})`, { underline: true });
    doc.fontSize(10);
    if (caseNotes.auditorVisible.length === 0) {
      doc.text("No auditor-visible notes.");
    } else {
      caseNotes.auditorVisible.forEach((n) => {
        doc.text(`• Note by ${n.authorUserId} — ${new Date(n.createdAt).toUTCString()}`);
        doc.text(n.body, { indent: 10 });
      });
    }
    if (caseNotes.internal.length > 0) {
      doc.moveDown(0.5);
      doc.text(`Internal notes (metadata only): ${caseNotes.internal.length}`);
    }
    doc.moveDown();

    doc.fontSize(14).text(`Audit Timeline (${auditTimeline.length})`, { underline: true });
    doc.fontSize(10);
    if (auditTimeline.length === 0) {
      doc.text("No audit events.");
    } else {
      auditTimeline.forEach((e) => {
        const line = [
          `• ${e.action}`,
          e.actorUserId ? `by ${e.actorUserId}` : null,
          e.entityType ? `on ${e.entityType}` : null,
          new Date(e.createdAt).toUTCString(),
        ]
          .filter(Boolean)
          .join(" | ");
        doc.text(line);
        if (e.metadataSummary) doc.text(`  Metadata: ${e.metadataSummary}`, { indent: 10 });
      });
    }
    doc.moveDown();

    doc.fontSize(8).text(`RegOps AI Evidence Export v${exportMetadata.exportVersion}`, 50, doc.page.height - 50, {
      align: "center",
    });
    doc.text(`This export is advisory and must be reviewed by human compliance staff.`, 50, doc.page.height - 35, {
      align: "center",
    });

    doc.end();
  });
}

export function getSafeExportFilename(caseId: string, format: "json" | "pdf"): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `regops-evidence-case-${caseId}-${date}.${format}`;
}

export async function generateEvidenceExportService(
  ctx: ActorContext,
  input: BuildEvidenceExportInput
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  assertPermission(ctx, "evidence:export");

  const exportData = await buildEvidenceExportService(ctx, input);

  let buffer: Buffer;
  let contentType: string;

  if (input.format === "json") {
    buffer = await renderEvidenceExportJsonService(exportData);
    contentType = "application/json";
  } else if (input.format === "pdf") {
    buffer = await renderEvidenceExportPdfService(exportData);
    contentType = "application/pdf";
  } else {
    throw new Error("Invalid export format");
  }

  const filename = getSafeExportFilename(input.complianceCaseId, input.format);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "EVIDENCE_EXPORT_GENERATED",
    entityType: "ComplianceCase",
    entityId: input.complianceCaseId,
    metadataJson: JSON.stringify({
      format: input.format,
      exportVersion: exportData.exportMetadata.exportVersion,
      documentCount: exportData.documents.length,
      transactionCount: exportData.transactions.count,
      riskSignalCount: exportData.riskSignals.length,
      riskMemoCount: exportData.riskMemos.historical.length,
      approvalDecisionCount: exportData.finalDecisions.length,
    }),
  });

  return { buffer, contentType, filename };
}
