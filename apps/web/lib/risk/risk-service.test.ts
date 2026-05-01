import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@regops-ai/database";
import {
  OrganizationStatus,
  UserStatus,
  OrganizationRole,
  MembershipStatus,
  ProfileStatus,
  CaseStatus,
  RiskLevel,
} from "@regops-ai/database";
import { generateRiskSignalsForCaseService } from "./risk-service";
import type { ActorContext } from "./risk-service";

async function cleanupTestData() {
  const tables = [
    "AuditEvent",
    "ApprovalDecision",
    "RiskMemo",
    "RiskAssessment",
    "RiskSignal",
    "CaseNote",
    "ComplianceCase",
    "Transaction",
    "TransactionImportBatch",
    "Document",
    "PolicyChunk",
    "PolicyDocument",
    "BusinessProfile",
    "CustomerProfile",
    "OrganizationMember",
    "PasswordCredential",
    "User",
    "Organization",
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE 1=1`);
  }
}

async function seedOrgWithCase() {
  const org = await prisma.organization.create({
    data: { name: "Org", slug: "org", status: OrganizationStatus.ACTIVE },
  });

  const owner = await prisma.user.create({
    data: { email: "owner@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });

  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  const customer = await prisma.customerProfile.create({
    data: {
      organizationId: org.id,
      firstName: "Alice",
      lastName: "Smith",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.LOW,
      nationality: "US",
      countryOfResidence: "US",
    },
  });

  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Case 1", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });

  return { org, owner, customer, caseRecord };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("generateRiskSignalsForCaseService", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  it("creates HIGH_VALUE_TRANSACTION signal", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-HIGH",
        direction: "INBOUND",
        amount: 15000,
        currency: "USD",
        counterpartyName: "Big Corp",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });

    const result = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.some((s) => s.ruleId === "HIGH_VALUE_TRANSACTION")).toBe(true);
  });

  it("creates HIGH_RISK_COUNTRY signal", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-IR",
        direction: "OUTBOUND",
        amount: 5000,
        currency: "USD",
        counterpartyName: "Iranian Bank",
        counterpartyCountry: "IR",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });

    const result = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.some((s) => s.ruleId === "HIGH_RISK_COUNTRY")).toBe(true);
  });

  it("does not duplicate signals on repeated run", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-HIGH",
        direction: "INBOUND",
        amount: 15000,
        currency: "USD",
        counterpartyName: "Big Corp",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });

    const first = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    const second = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);

    expect(first.created).toBeGreaterThanOrEqual(1);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.filter((s) => s.ruleId === "HIGH_VALUE_TRANSACTION")).toHaveLength(1);
  });

  it("creates STRUCTURING_PATTERN signal", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: {
          organizationId: org.id,
          customerProfileId: customer.id,
          complianceCaseId: caseRecord.id,
          externalReference: `TXN-STR-${i}`,
          direction: "INBOUND",
          amount: 8500 + i * 100,
          currency: "USD",
          counterpartyName: `Sender ${i}`,
          occurredAt: new Date(2024, 0, 1 + i, 10, 0, 0),
        },
      });
    }

    const result = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.some((s) => s.ruleId === "STRUCTURING_PATTERN")).toBe(true);
  });

  it("creates RAPID_IN_OUT_FLOW signal", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-IN",
        direction: "INBOUND",
        amount: 10000,
        currency: "USD",
        counterpartyName: "Sender",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-OUT",
        direction: "OUTBOUND",
        amount: 10100,
        currency: "USD",
        counterpartyName: "Receiver",
        occurredAt: new Date("2024-01-15T14:00:00Z"),
      },
    });

    const result = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.some((s) => s.ruleId === "RAPID_IN_OUT_FLOW")).toBe(true);
  });

  it("creates MISSING_PROFILE_DATA signal", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.customerProfile.update({
      where: { id: customer.id },
      data: { nationality: null, countryOfResidence: null },
    });

    const result = await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const signals = await prisma.riskSignal.findMany({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(signals.some((s) => s.ruleId === "MISSING_PROFILE_DATA")).toBe(true);
  });

  it("writes RISK_SIGNALS_GENERATED audit", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-HIGH",
        direction: "INBOUND",
        amount: 15000,
        currency: "USD",
        counterpartyName: "Big Corp",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });

    await generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "RISK_SIGNALS_GENERATED" },
    });
    expect(audits).toHaveLength(1);
  });

  it("rejects cross-org case", async () => {
    const { org, owner } = await seedOrgWithCase();
    const orgB = await prisma.organization.create({
      data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
    });
    const caseB = await prisma.complianceCase.create({
      data: { organizationId: orgB.id, title: "Case B", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
    });

    await expect(
      generateRiskSignalsForCaseService(ctx(owner.id, org.id, "OWNER"), caseB.id)
    ).rejects.toThrow("Case not found");
  });
});
