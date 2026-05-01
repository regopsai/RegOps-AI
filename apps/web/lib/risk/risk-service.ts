import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import type { RiskSignalCandidate, RuleTransaction } from "./rules";
import {
  evaluateHighValueTransaction,
  evaluateStructuringPattern,
  evaluateHighRiskCountry,
  evaluateRapidInOutFlow,
  evaluateManyCounterparties,
  evaluateMissingProfileData,
  evaluateMissingRequiredDocuments,
} from "./rules";

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

function toRuleTransaction(tx: {
  id: string;
  externalReference: string | null;
  direction: "INBOUND" | "OUTBOUND";
  amount: { toString(): string };
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
}): RuleTransaction {
  return {
    id: tx.id,
    externalReference: tx.externalReference ?? "",
    direction: tx.direction,
    amount: tx.amount as unknown as { toString(): string; lessThan(n: number): boolean },
    currency: tx.currency,
    counterpartyName: tx.counterpartyName,
    counterpartyAccount: tx.counterpartyAccount,
    counterpartyCountry: tx.counterpartyCountry,
    paymentRail: tx.paymentRail,
    transactionType: tx.transactionType,
    description: tx.description,
    occurredAt: tx.occurredAt,
    customerProfileId: tx.customerProfileId,
    businessProfileId: tx.businessProfileId,
    complianceCaseId: tx.complianceCaseId,
  };
}

async function createRiskSignals(
  organizationId: string,
  candidates: RiskSignalCandidate[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      await prisma.riskSignal.create({
        data: {
          organizationId,
          complianceCaseId: candidate.complianceCaseId ?? null,
          customerProfileId: candidate.customerProfileId ?? null,
          businessProfileId: candidate.businessProfileId ?? null,
          transactionId: candidate.transactionId ?? null,
          ruleId: candidate.ruleId,
          title: candidate.title,
          description: candidate.description,
          severity: candidate.severity,
          evidenceJson: candidate.evidenceJson,
          evidenceHash: candidate.evidenceHash,
        },
      });
      created++;
    } catch (e) {
      // Unique constraint violation means duplicate signal
      const err = e as { code?: string };
      if (err.code === "P2002") {
        skipped++;
      } else {
        throw e;
      }
    }
  }

  return { created, skipped };
}

export async function generateRiskSignalsForCaseService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "cases:update");

  const caseRecord = await prisma.complianceCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      customerProfile: true,
      businessProfile: true,
      transactions: true,
    },
  });

  if (!caseRecord) {
    throw new Error("Case not found");
  }

  const transactions = caseRecord.transactions.map(toRuleTransaction);
  const candidates: RiskSignalCandidate[] = [];

  // Transaction-based rules
  for (const tx of transactions) {
    const highValue = evaluateHighValueTransaction(tx);
    if (highValue) candidates.push(highValue);

    const highRisk = evaluateHighRiskCountry(tx);
    if (highRisk) candidates.push(highRisk);
  }

  const structuring = evaluateStructuringPattern(transactions);
  if (structuring) candidates.push(structuring);

  const rapidFlow = evaluateRapidInOutFlow(transactions);
  if (rapidFlow) candidates.push(rapidFlow);

  const manyCounterparties = evaluateManyCounterparties(transactions);
  if (manyCounterparties) candidates.push(manyCounterparties);

  // Profile-based rules
  if (caseRecord.customerProfile) {
    const missingData = evaluateMissingProfileData(
      {
        id: caseRecord.customerProfile.id,
        dateOfBirth: caseRecord.customerProfile.dateOfBirth,
        nationality: caseRecord.customerProfile.nationality,
        countryOfResidence: caseRecord.customerProfile.countryOfResidence,
      },
      null
    );
    if (missingData) candidates.push(missingData);

    const docs = await prisma.document.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerProfileId: caseRecord.customerProfile.id,
        deletedAt: null,
      },
      select: { type: true, status: true },
    });

    const missingDocs = evaluateMissingRequiredDocuments(
      caseRecord.customerProfile.id,
      undefined,
      docs
    );
    if (missingDocs) candidates.push(missingDocs);
  }

  if (caseRecord.businessProfile) {
    const missingData = evaluateMissingProfileData(null, {
      id: caseRecord.businessProfile.id,
      registrationNumber: caseRecord.businessProfile.registrationNumber,
      incorporationCountry: caseRecord.businessProfile.incorporationCountry,
      industry: caseRecord.businessProfile.industry,
    });
    if (missingData) candidates.push(missingData);

    const docs = await prisma.document.findMany({
      where: {
        organizationId: ctx.organizationId,
        businessProfileId: caseRecord.businessProfile.id,
        deletedAt: null,
      },
      select: { type: true, status: true },
    });

    const missingDocs = evaluateMissingRequiredDocuments(
      undefined,
      caseRecord.businessProfile.id,
      docs
    );
    if (missingDocs) candidates.push(missingDocs);
  }

  // Set case linkage on all candidates
  for (const c of candidates) {
    c.complianceCaseId = caseId;
  }

  const result = await createRiskSignals(ctx.organizationId, candidates);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "RISK_SIGNALS_GENERATED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify({
      targetType: "case",
      targetId: caseId,
      rulesEvaluated: 7,
      createdCount: result.created,
      skippedCount: result.skipped,
    }),
  });

  return result;
}

export async function generateRiskSignalsForProfileService(
  ctx: ActorContext,
  profileType: "customer" | "business",
  profileId: string
) {
  assertPermission(ctx, "cases:update");

  const where =
    profileType === "customer"
      ? { customerProfileId: profileId, organizationId: ctx.organizationId }
      : { businessProfileId: profileId, organizationId: ctx.organizationId };

  const transactions = await prisma.transaction.findMany({ where });
  const ruleTxs = transactions.map(toRuleTransaction);
  const candidates: RiskSignalCandidate[] = [];

  for (const tx of ruleTxs) {
    const highValue = evaluateHighValueTransaction(tx);
    if (highValue) candidates.push(highValue);

    const highRisk = evaluateHighRiskCountry(tx);
    if (highRisk) candidates.push(highRisk);
  }

  const structuring = evaluateStructuringPattern(ruleTxs);
  if (structuring) candidates.push(structuring);

  const rapidFlow = evaluateRapidInOutFlow(ruleTxs);
  if (rapidFlow) candidates.push(rapidFlow);

  const manyCounterparties = evaluateManyCounterparties(ruleTxs);
  if (manyCounterparties) candidates.push(manyCounterparties);

  if (profileType === "customer") {
    const profile = await prisma.customerProfile.findFirst({
      where: { id: profileId, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (profile) {
      const missingData = evaluateMissingProfileData(
        {
          id: profile.id,
          dateOfBirth: profile.dateOfBirth,
          nationality: profile.nationality,
          countryOfResidence: profile.countryOfResidence,
        },
        null
      );
      if (missingData) candidates.push(missingData);

      const docs = await prisma.document.findMany({
        where: { organizationId: ctx.organizationId, customerProfileId: profileId, deletedAt: null },
        select: { type: true, status: true },
      });
      const missingDocs = evaluateMissingRequiredDocuments(profileId, undefined, docs);
      if (missingDocs) candidates.push(missingDocs);
    }
  } else {
    const profile = await prisma.businessProfile.findFirst({
      where: { id: profileId, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (profile) {
      const missingData = evaluateMissingProfileData(null, {
        id: profile.id,
        registrationNumber: profile.registrationNumber,
        incorporationCountry: profile.incorporationCountry,
        industry: profile.industry,
      });
      if (missingData) candidates.push(missingData);

      const docs = await prisma.document.findMany({
        where: { organizationId: ctx.organizationId, businessProfileId: profileId, deletedAt: null },
        select: { type: true, status: true },
      });
      const missingDocs = evaluateMissingRequiredDocuments(undefined, profileId, docs);
      if (missingDocs) candidates.push(missingDocs);
    }
  }

  const result = await createRiskSignals(ctx.organizationId, candidates);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "RISK_SIGNALS_GENERATED",
    entityType: profileType === "customer" ? "CustomerProfile" : "BusinessProfile",
    entityId: profileId,
    metadataJson: JSON.stringify({
      targetType: profileType,
      targetId: profileId,
      rulesEvaluated: 7,
      createdCount: result.created,
      skippedCount: result.skipped,
    }),
  });

  return result;
}
