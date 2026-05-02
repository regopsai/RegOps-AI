import { createHash } from "crypto";
import { prisma } from "@regops-ai/database";
import { maskWalletAddress } from "@/lib/onchain/masking";

export interface CaseEvidenceContext {
  caseSummary: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    riskLevel: string;
    openedAt: string;
  };
  profileSummary: {
    type: "individual" | "business";
    id: string;
    displayName: string;
    details: Record<string, string | null | undefined>;
  } | null;
  documents: Array<{
    id: string;
    type: string;
    status: string;
    originalFileName: string;
    extractedTextSnippet: string | null;
  }>;
  transactions: Array<{
    id: string;
    externalReference: string | null;
    direction: string;
    amount: string;
    currency: string;
    counterpartyCountry: string | null;
    paymentRail: string | null;
    transactionType: string | null;
    occurredAt: string;
    description: string | null;
  }>;
  riskSignals: Array<{
    id: string;
    ruleId: string;
    title: string;
    description: string;
    severity: string;
    evidenceJson: string | null;
  }>;
  notes: Array<{
    id: string;
    visibility: string;
    bodySnippet: string;
    createdAt: string;
  }>;
  onChainWallets: Array<{
    id: string;
    network: string;
    addressMasked: string;
    label: string | null;
    latestRiskLevel: string;
    providerCategories: string[];
    providerLabels: string[];
  }>;
  onChainTransactions: Array<{
    id: string;
    network: string;
    txHash: string;
    direction: string;
    assetSymbol: string;
    amount: string;
    usdValue: string | null;
    counterpartyAddressMasked: string | null;
    blockTime: string;
  }>;
  onChainRiskSignals: Array<{
    ruleId: string;
    title: string;
    severity: string;
    description: string;
  }>;
  missingDataSummary: {
    missingProfileFields: string[];
    missingDocumentTypes: string[];
  };
}

export interface BuildContextResult {
  contextJson: string;
  contextText: string;
  contextHash: string;
  includedEvidenceReferences: Array<{ type: string; id: string; label: string }>;
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `"${k}":${canonicalStringify((obj as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

function computeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function truncateText(text: string | null, maxChars: number): string | null {
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[... truncated ...]";
}

export async function buildRiskMemoContextService(
  organizationId: string,
  caseId: string,
  maxContextChars: number = 30000
): Promise<BuildContextResult> {
  const caseRecord = await prisma.complianceCase.findFirst({
    where: { id: caseId, organizationId, deletedAt: null },
    include: {
      customerProfile: true,
      businessProfile: true,
      documents: {
        where: { deletedAt: null },
        select: {
          id: true,
          type: true,
          status: true,
          originalFileName: true,
          extractedText: true,
        },
      },
      transactions: {
        select: {
          id: true,
          externalReference: true,
          direction: true,
          amount: true,
          currency: true,
          counterpartyCountry: true,
          paymentRail: true,
          transactionType: true,
          occurredAt: true,
          description: true,
        },
      },
      riskSignals: {
        select: {
          id: true,
          ruleId: true,
          title: true,
          description: true,
          severity: true,
          evidenceJson: true,
        },
      },
      notes: {
        where: { deletedAt: null },
        select: {
          id: true,
          visibility: true,
          body: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      walletAddresses: {
        where: { deletedAt: null },
        include: {
          screeningRuns: { orderBy: { screenedAt: "desc" }, take: 1 },
        },
      },
      onChainTransactions: {
        select: {
          id: true,
          network: true,
          txHash: true,
          direction: true,
          assetSymbol: true,
          amount: true,
          usdValue: true,
          counterpartyAddress: true,
          blockTime: true,
        },
        orderBy: { blockTime: "desc" },
        take: 50,
      },
    },
  });

  if (!caseRecord) {
    throw new Error("Case not found");
  }

  const profile = caseRecord.customerProfile
    ? {
        type: "individual" as const,
        id: caseRecord.customerProfile.id,
        displayName: `${caseRecord.customerProfile.firstName} ${caseRecord.customerProfile.lastName}`,
        details: {
          email: caseRecord.customerProfile.email,
          phone: caseRecord.customerProfile.phone,
          dateOfBirth: caseRecord.customerProfile.dateOfBirth?.toISOString() ?? null,
          nationality: caseRecord.customerProfile.nationality,
          countryOfResidence: caseRecord.customerProfile.countryOfResidence,
          addressLine1: caseRecord.customerProfile.addressLine1,
          city: caseRecord.customerProfile.city,
          postalCode: caseRecord.customerProfile.postalCode,
          country: caseRecord.customerProfile.country,
          riskLevel: caseRecord.customerProfile.riskLevel,
          status: caseRecord.customerProfile.status,
        },
      }
    : caseRecord.businessProfile
      ? {
          type: "business" as const,
          id: caseRecord.businessProfile.id,
          displayName: caseRecord.businessProfile.legalName,
          details: {
            tradingName: caseRecord.businessProfile.tradingName,
            registrationNumber: caseRecord.businessProfile.registrationNumber,
            taxId: caseRecord.businessProfile.taxId,
            incorporationCountry: caseRecord.businessProfile.incorporationCountry,
            operatingCountry: caseRecord.businessProfile.operatingCountry,
            website: caseRecord.businessProfile.website,
            industry: caseRecord.businessProfile.industry,
            riskLevel: caseRecord.businessProfile.riskLevel,
            status: caseRecord.businessProfile.status,
          },
        }
      : null;

  const extractedTextPerDoc = 2000;
  const documents = caseRecord.documents.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    originalFileName: d.originalFileName,
    extractedTextSnippet: truncateText(d.extractedText, extractedTextPerDoc),
  }));

  const transactions = caseRecord.transactions.map((t) => ({
    id: t.id,
    externalReference: t.externalReference,
    direction: t.direction,
    amount: t.amount.toString(),
    currency: t.currency,
    counterpartyCountry: t.counterpartyCountry,
    paymentRail: t.paymentRail,
    transactionType: t.transactionType,
    occurredAt: t.occurredAt.toISOString(),
    description: truncateText(t.description, 500),
  }));

  const riskSignals = caseRecord.riskSignals.map((rs) => ({
    id: rs.id,
    ruleId: rs.ruleId,
    title: rs.title,
    description: rs.description,
    severity: rs.severity,
    evidenceJson: truncateText(rs.evidenceJson, 1000),
  }));

  const notes = caseRecord.notes.map((n) => ({
    id: n.id,
    visibility: n.visibility,
    bodySnippet: truncateText(n.body, 1000) ?? "",
    createdAt: n.createdAt.toISOString(),
  }));

  const onChainWallets = caseRecord.walletAddresses.map((w) => {
    const latestScreening = w.screeningRuns[0];
    return {
      id: w.id,
      network: w.network,
      addressMasked: maskWalletAddress(w.address),
      label: w.label,
      latestRiskLevel: latestScreening?.riskLevel ?? "UNKNOWN",
      providerCategories: latestScreening?.categoriesJson ? JSON.parse(latestScreening.categoriesJson) as string[] : [],
      providerLabels: latestScreening?.labelsJson ? JSON.parse(latestScreening.labelsJson) as string[] : [],
    };
  });

  const onChainTransactions = caseRecord.onChainTransactions.map((t) => ({
    id: t.id,
    network: t.network,
    txHash: t.txHash,
    direction: t.direction,
    assetSymbol: t.assetSymbol,
    amount: t.amount.toString(),
    usdValue: t.usdValue ? t.usdValue.toString() : null,
    counterpartyAddressMasked: t.counterpartyAddress ? maskWalletAddress(t.counterpartyAddress) : null,
    blockTime: t.blockTime.toISOString(),
  }));

  const onChainRiskSignals = caseRecord.riskSignals
    .filter((rs) => rs.ruleId.startsWith("WALLET_") || rs.ruleId.startsWith("HIGH_VALUE_STABLECOIN") || rs.ruleId.startsWith("RAPID_STABLECOIN") || rs.ruleId.startsWith("HIGH_RISK_COUNTERPARTY") || rs.ruleId.startsWith("CROSS_CHAIN"))
    .map((rs) => ({
      ruleId: rs.ruleId,
      title: rs.title,
      severity: rs.severity,
      description: rs.description,
    }));

  // Compute missing data summary
  const missingProfileFields: string[] = [];
  const missingDocumentTypes: string[] = [];

  if (caseRecord.customerProfile) {
    if (!caseRecord.customerProfile.dateOfBirth) missingProfileFields.push("dateOfBirth");
    if (!caseRecord.customerProfile.nationality) missingProfileFields.push("nationality");
    if (!caseRecord.customerProfile.countryOfResidence) missingProfileFields.push("countryOfResidence");

    const customerDocs = await prisma.document.findMany({
      where: {
        organizationId,
        customerProfileId: caseRecord.customerProfile.id,
        deletedAt: null,
      },
      select: { type: true, status: true },
    });
    const hasId = customerDocs.some((d) => d.type === "ID_DOCUMENT" && d.status !== "ARCHIVED");
    const hasAddress = customerDocs.some((d) => d.type === "PROOF_OF_ADDRESS" && d.status !== "ARCHIVED");
    if (!hasId) missingDocumentTypes.push("ID_DOCUMENT");
    if (!hasAddress) missingDocumentTypes.push("PROOF_OF_ADDRESS");
  }

  if (caseRecord.businessProfile) {
    if (!caseRecord.businessProfile.registrationNumber) missingProfileFields.push("registrationNumber");
    if (!caseRecord.businessProfile.incorporationCountry) missingProfileFields.push("incorporationCountry");
    if (!caseRecord.businessProfile.industry) missingProfileFields.push("industry");

    const businessDocs = await prisma.document.findMany({
      where: {
        organizationId,
        businessProfileId: caseRecord.businessProfile.id,
        deletedAt: null,
      },
      select: { type: true, status: true },
    });
    const hasReg = businessDocs.some((d) => d.type === "COMPANY_REGISTRATION" && d.status !== "ARCHIVED");
    const hasBeneficial = businessDocs.some((d) => d.type === "BENEFICIAL_OWNERSHIP" && d.status !== "ARCHIVED");
    if (!hasReg) missingDocumentTypes.push("COMPANY_REGISTRATION");
    if (!hasBeneficial) missingDocumentTypes.push("BENEFICIAL_OWNERSHIP");
  }

  const context: CaseEvidenceContext = {
    caseSummary: {
      id: caseRecord.id,
      title: caseRecord.title,
      description: caseRecord.description,
      status: caseRecord.status,
      riskLevel: caseRecord.riskLevel,
      openedAt: caseRecord.openedAt.toISOString(),
    },
    profileSummary: profile,
    documents,
    transactions,
    riskSignals,
    notes,
    onChainWallets,
    onChainTransactions,
    onChainRiskSignals,
    missingDataSummary: {
      missingProfileFields,
      missingDocumentTypes,
    },
  };

  const contextJson = canonicalStringify(context);

  // Build human-readable context text for the prompt
  const parts: string[] = [];
  parts.push(`# Case: ${context.caseSummary.title}`);
  parts.push(`Status: ${context.caseSummary.status} | Risk Level: ${context.caseSummary.riskLevel}`);
  if (context.caseSummary.description) {
    parts.push(`Description: ${context.caseSummary.description}`);
  }

  if (context.profileSummary) {
    parts.push(`\n## Profile (${context.profileSummary.type})`);
    parts.push(`Name: ${context.profileSummary.displayName}`);
    for (const [key, value] of Object.entries(context.profileSummary.details)) {
      if (value) parts.push(`${key}: ${value}`);
    }
  }

  if (context.documents.length > 0) {
    parts.push(`\n## Documents (${context.documents.length})`);
    for (const d of context.documents) {
      parts.push(`- ${d.originalFileName} [${d.type}] (${d.status})`);
      if (d.extractedTextSnippet) {
        parts.push(`  Extracted text snippet:\n  ${d.extractedTextSnippet.split("\n").join("\n  ")}`);
      }
    }
  }

  if (context.transactions.length > 0) {
    parts.push(`\n## Transactions (${context.transactions.length})`);
    for (const t of context.transactions) {
      parts.push(
        `- ${t.externalReference ?? t.id}: ${t.direction} ${t.amount} ${t.currency} | ${t.counterpartyCountry ?? "—"} | ${t.paymentRail ?? "—"} | ${t.occurredAt}`
      );
    }
  }

  if (context.riskSignals.length > 0) {
    parts.push(`\n## Risk Signals (${context.riskSignals.length})`);
    for (const rs of context.riskSignals) {
      parts.push(`- [${rs.severity}] ${rs.title} (${rs.ruleId})`);
      parts.push(`  ${rs.description}`);
    }
  }

  if (context.notes.length > 0) {
    parts.push(`\n## Notes (${context.notes.length})`);
    for (const n of context.notes) {
      parts.push(`- [${n.visibility}] ${n.createdAt}`);
      parts.push(`  ${n.bodySnippet}`);
    }
  }

  if (context.onChainWallets.length > 0) {
    parts.push(`\n## On-Chain Wallets (${context.onChainWallets.length})`);
    for (const w of context.onChainWallets) {
      parts.push(`- ${w.network} ${w.addressMasked}${w.label ? ` (${w.label})` : ""} — Risk: ${w.latestRiskLevel}`);
      if (w.providerCategories.length > 0) parts.push(`  Categories: ${w.providerCategories.join(", ")}`);
      if (w.providerLabels.length > 0) parts.push(`  Labels: ${w.providerLabels.join(", ")}`);
    }
  }

  if (context.onChainTransactions.length > 0) {
    parts.push(`\n## On-Chain Transactions (${context.onChainTransactions.length})`);
    for (const t of context.onChainTransactions) {
      parts.push(`- ${t.network} ${t.txHash}: ${t.direction} ${t.amount} ${t.assetSymbol}${t.usdValue ? ` (~$${t.usdValue})` : ""}`);
    }
  }

  if (context.onChainRiskSignals.length > 0) {
    parts.push(`\n## On-Chain Risk Signals (${context.onChainRiskSignals.length})`);
    for (const rs of context.onChainRiskSignals) {
      parts.push(`- [${rs.severity}] ${rs.title} (${rs.ruleId})`);
      parts.push(`  ${rs.description}`);
    }
  }

  if (context.missingDataSummary.missingProfileFields.length > 0) {
    parts.push(`\n## Missing Profile Fields`);
    parts.push(context.missingDataSummary.missingProfileFields.join(", "));
  }

  if (context.missingDataSummary.missingDocumentTypes.length > 0) {
    parts.push(`\n## Missing Document Types`);
    parts.push(context.missingDataSummary.missingDocumentTypes.join(", "));
  }

  let contextText = parts.join("\n");
  if (contextText.length > maxContextChars) {
    contextText = contextText.slice(0, maxContextChars) + "\n\n[... context truncated ...]";
  }

  const contextHash = computeHash(contextJson);

  const includedEvidenceReferences: Array<{ type: string; id: string; label: string }> = [];
  if (profile) {
    includedEvidenceReferences.push({ type: "profile", id: profile.id, label: profile.displayName });
  }
  for (const d of documents) {
    includedEvidenceReferences.push({ type: "document", id: d.id, label: d.originalFileName });
  }
  for (const t of transactions) {
    includedEvidenceReferences.push({
      type: "transaction",
      id: t.id,
      label: t.externalReference ?? t.id,
    });
  }
  for (const rs of riskSignals) {
    includedEvidenceReferences.push({ type: "risk_signal", id: rs.id, label: rs.title });
  }
  for (const n of notes) {
    includedEvidenceReferences.push({ type: "note", id: n.id, label: `Note ${n.createdAt}` });
  }
  includedEvidenceReferences.push({ type: "case", id: caseRecord.id, label: caseRecord.title });

  return {
    contextJson,
    contextText,
    contextHash,
    includedEvidenceReferences,
  };
}
