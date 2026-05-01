import { createHash } from "crypto";

export interface RuleTransaction {
  id: string;
  externalReference: string;
  direction: "INBOUND" | "OUTBOUND";
  amount: { toString(): string; lessThan(n: number): boolean };
  currency: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  counterpartyCountry: string | null;
  paymentRail: string | null;
  transactionType: string | null;
  description: string | null;
  occurredAt: Date;
  customerProfileId: string | null;
  businessProfileId: string | null;
  complianceCaseId: string | null;
}

export interface RuleCustomerProfile {
  id: string;
  dateOfBirth: Date | null;
  nationality: string | null;
  countryOfResidence: string | null;
}

export interface RuleBusinessProfile {
  id: string;
  registrationNumber: string | null;
  incorporationCountry: string | null;
  industry: string | null;
}

export interface RuleDocument {
  type: string;
  status: string;
}

export interface RiskSignalCandidate {
  ruleId: string;
  title: string;
  description: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidenceJson: string;
  evidenceHash: string;
  transactionId?: string;
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
}

function hashEvidence(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
}

function thresholdForCurrency(currency: string): number {
  const c = currency.toUpperCase();
  if (c === "EUR" || c === "USD" || c === "GBP") return 10000;
  return 10000;
}

// Rule 1: HIGH_VALUE_TRANSACTION
export function evaluateHighValueTransaction(tx: RuleTransaction): RiskSignalCandidate | null {
  const threshold = thresholdForCurrency(tx.currency);
  if (tx.amount.lessThan(threshold)) return null;

  const evidence = {
    amount: tx.amount.toString(),
    currency: tx.currency,
    threshold,
    transactionId: tx.id,
    externalReference: tx.externalReference,
  };

  return {
    ruleId: "HIGH_VALUE_TRANSACTION",
    title: "High-value transaction",
    description: `Transaction ${tx.externalReference} of ${tx.amount.toString()} ${tx.currency} exceeds threshold of ${threshold}.`,
    severity: "HIGH",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    transactionId: tx.id,
    customerProfileId: tx.customerProfileId ?? undefined,
    businessProfileId: tx.businessProfileId ?? undefined,
    complianceCaseId: tx.complianceCaseId ?? undefined,
  };
}

// Rule 2: STRUCTURING_PATTERN
export function evaluateStructuringPattern(transactions: RuleTransaction[]): RiskSignalCandidate | null {
  const windowDays = 7;
  const minTransactions = 3;
  const minAmount = 8000;
  const maxAmount = 9999.99;

  // Sort by occurredAt
  const sorted = [...transactions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const windowEnd = new Date(sorted[i].occurredAt);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    const windowTxs = sorted.filter(
      (t) => t.occurredAt >= sorted[i].occurredAt && t.occurredAt <= windowEnd
    );

    const qualifying = windowTxs.filter((t) => {
      const amt = parseFloat(t.amount.toString());
      return amt >= minAmount && amt <= maxAmount;
    });

    if (qualifying.length >= minTransactions) {
      const evidence = {
        transactionCount: qualifying.length,
        windowDays,
        minAmount,
        maxAmount,
        transactionIds: qualifying.map((t) => t.id),
        externalReferences: qualifying.map((t) => t.externalReference),
        amounts: qualifying.map((t) => t.amount.toString()),
        windowStart: sorted[i].occurredAt.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };

      const customerProfileId = qualifying[0].customerProfileId ?? undefined;
      const businessProfileId = qualifying[0].businessProfileId ?? undefined;
      const complianceCaseId = qualifying[0].complianceCaseId ?? undefined;

      return {
        ruleId: "STRUCTURING_PATTERN",
        title: "Potential structuring pattern",
        description: `${qualifying.length} transactions between ${minAmount} and ${maxAmount} within ${windowDays} days.`,
        severity: "CRITICAL",
        evidenceJson: JSON.stringify(evidence),
        evidenceHash: hashEvidence(evidence),
        customerProfileId,
        businessProfileId,
        complianceCaseId,
      };
    }
  }

  return null;
}

// Rule 3: HIGH_RISK_COUNTRY
const HIGH_RISK_COUNTRIES = new Set(["IR", "KP", "SY", "MM"]);

export function evaluateHighRiskCountry(tx: RuleTransaction): RiskSignalCandidate | null {
  const country = tx.counterpartyCountry?.toUpperCase();
  if (!country || !HIGH_RISK_COUNTRIES.has(country)) return null;

  const evidence = {
    country,
    transactionId: tx.id,
    externalReference: tx.externalReference,
  };

  return {
    ruleId: "HIGH_RISK_COUNTRY",
    title: "High-risk country counterparty",
    description: `Transaction ${tx.externalReference} involves counterparty in high-risk country ${country}.`,
    severity: "HIGH",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    transactionId: tx.id,
    customerProfileId: tx.customerProfileId ?? undefined,
    businessProfileId: tx.businessProfileId ?? undefined,
    complianceCaseId: tx.complianceCaseId ?? undefined,
  };
}

// Rule 4: RAPID_IN_OUT_FLOW
export function evaluateRapidInOutFlow(transactions: RuleTransaction[]): RiskSignalCandidate | null {
  const tolerance = 0.1; // 10%
  const hoursWindow = 24;

  const inbounds = transactions.filter((t) => t.direction === "INBOUND");
  const outbounds = transactions.filter((t) => t.direction === "OUTBOUND");

  for (const inbound of inbounds) {
    for (const outbound of outbounds) {
      const timeDeltaHours =
        Math.abs(outbound.occurredAt.getTime() - inbound.occurredAt.getTime()) / (1000 * 60 * 60);
      if (timeDeltaHours > hoursWindow) continue;

      const inAmt = parseFloat(inbound.amount.toString());
      const outAmt = parseFloat(outbound.amount.toString());
      if (inAmt === 0) continue;

      const amountDelta = Math.abs(outAmt - inAmt) / inAmt;
      if (amountDelta > tolerance) continue;

      const evidence = {
        inboundTransactionId: inbound.id,
        outboundTransactionId: outbound.id,
        inboundAmount: inbound.amount.toString(),
        outboundAmount: outbound.amount.toString(),
        currency: inbound.currency,
        timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
      };

      const threshold = thresholdForCurrency(inbound.currency);
      const severity = inAmt >= threshold ? "HIGH" : "MEDIUM";

      return {
        ruleId: "RAPID_IN_OUT_FLOW",
        title: "Rapid inbound/outbound flow",
        description: `Inbound ${inbound.amount.toString()} and outbound ${outbound.amount.toString()} ${inbound.currency} within ${Math.round(timeDeltaHours)} hours.`,
        severity,
        evidenceJson: JSON.stringify(evidence),
        evidenceHash: hashEvidence(evidence),
        transactionId: outbound.id,
        customerProfileId: inbound.customerProfileId ?? outbound.customerProfileId ?? undefined,
        businessProfileId: inbound.businessProfileId ?? outbound.businessProfileId ?? undefined,
        complianceCaseId: inbound.complianceCaseId ?? outbound.complianceCaseId ?? undefined,
      };
    }
  }

  return null;
}

// Rule 5: MANY_COUNTERPARTIES
export function evaluateManyCounterparties(transactions: RuleTransaction[]): RiskSignalCandidate | null {
  const windowDays = 30;
  const threshold = 5;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);

  const recent = transactions.filter((t) => t.occurredAt >= cutoff);
  const counterparties = new Set(recent.map((t) => t.counterpartyName).filter(Boolean));

  if (counterparties.size <= threshold) return null;

  const evidence = {
    uniqueCounterparties: counterparties.size,
    threshold,
    windowDays,
    counterparties: Array.from(counterparties).slice(0, 20),
  };

  const first = recent[0];

  return {
    ruleId: "MANY_COUNTERPARTIES",
    title: "Many unique counterparties",
    description: `${counterparties.size} unique counterparties within ${windowDays} days.`,
    severity: "MEDIUM",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    customerProfileId: first?.customerProfileId ?? undefined,
    businessProfileId: first?.businessProfileId ?? undefined,
    complianceCaseId: first?.complianceCaseId ?? undefined,
  };
}

// Rule 6: MISSING_PROFILE_DATA
export function evaluateMissingProfileData(
  customer?: RuleCustomerProfile | null,
  business?: RuleBusinessProfile | null
): RiskSignalCandidate | null {
  const missingFields: string[] = [];

  if (customer) {
    if (!customer.dateOfBirth) missingFields.push("dateOfBirth");
    if (!customer.nationality) missingFields.push("nationality");
    if (!customer.countryOfResidence) missingFields.push("countryOfResidence");
  }

  if (business) {
    if (!business.registrationNumber) missingFields.push("registrationNumber");
    if (!business.incorporationCountry) missingFields.push("incorporationCountry");
    if (!business.industry) missingFields.push("industry");
  }

  if (missingFields.length === 0) return null;

  const evidence = {
    missingFields,
    customerId: customer?.id,
    businessId: business?.id,
  };

  return {
    ruleId: "MISSING_PROFILE_DATA",
    title: "Missing profile data",
    description: `Profile is missing required fields: ${missingFields.join(", ")}.`,
    severity: "MEDIUM",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    customerProfileId: customer?.id ?? undefined,
    businessProfileId: business?.id ?? undefined,
    transactionId: undefined,
  };
}

// Rule 7: MISSING_REQUIRED_DOCUMENTS
export function evaluateMissingRequiredDocuments(
  customerId: string | undefined,
  businessId: string | undefined,
  documents: RuleDocument[]
): RiskSignalCandidate | null {
  const missingTypes: string[] = [];

  if (customerId) {
    const hasId = documents.some((d) => d.type === "ID_DOCUMENT" && d.status !== "ARCHIVED");
    const hasAddress = documents.some((d) => d.type === "PROOF_OF_ADDRESS" && d.status !== "ARCHIVED");
    if (!hasId) missingTypes.push("ID_DOCUMENT");
    if (!hasAddress) missingTypes.push("PROOF_OF_ADDRESS");
  }

  if (businessId) {
    const hasReg = documents.some((d) => d.type === "COMPANY_REGISTRATION" && d.status !== "ARCHIVED");
    const hasBeneficial = documents.some((d) => d.type === "BENEFICIAL_OWNERSHIP" && d.status !== "ARCHIVED");
    if (!hasReg) missingTypes.push("COMPANY_REGISTRATION");
    if (!hasBeneficial) missingTypes.push("BENEFICIAL_OWNERSHIP");
  }

  if (missingTypes.length === 0) return null;

  const evidence = {
    missingDocumentTypes: missingTypes,
    customerId,
    businessId,
  };

  return {
    ruleId: "MISSING_REQUIRED_DOCUMENTS",
    title: "Missing required documents",
    description: `Required documents not found: ${missingTypes.join(", ")}.`,
    severity: "HIGH",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    customerProfileId: customerId ?? undefined,
    businessProfileId: businessId ?? undefined,
    transactionId: undefined,
  };
}
