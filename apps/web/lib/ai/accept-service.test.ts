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
import { acceptRiskMemoService } from "./accept-service";
import type { ActorContext } from "./accept-service";

async function cleanupTestData() {
  const tables = [
    "AuditEvent",
    "ApprovalDecision",
    "RiskMemo",
    "AgentRun",
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

async function seedOrgWithMemo() {
  const org = await prisma.organization.create({
    data: { name: "Org", slug: "org", status: OrganizationStatus.ACTIVE },
  });

  const owner = await prisma.user.create({
    data: { email: "owner@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });

  const analyst = await prisma.user.create({
    data: { email: "analyst@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });

  const auditor = await prisma.user.create({
    data: { email: "auditor@example.com", name: "Auditor", status: UserStatus.ACTIVE },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: analyst.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: auditor.id, role: OrganizationRole.READ_ONLY_AUDITOR, status: MembershipStatus.ACTIVE },
    ],
  });

  const customer = await prisma.customerProfile.create({
    data: {
      organizationId: org.id,
      firstName: "Alice",
      lastName: "Smith",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.LOW,
    },
  });

  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Case 1", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });

  const memo = await prisma.riskMemo.create({
    data: {
      organizationId: org.id,
      complianceCaseId: caseRecord.id,
      executiveSummary: "Summary",
      profileSummary: "Profile",
      documentReview: "Docs",
      transactionReview: "TXNs",
      riskSignalsSummary: "Signals",
      missingInformation: "None",
      recommendedAction: "LOW_RISK_REVIEW",
      limitations: "Advisory only",
    },
  });

  return { org, owner, analyst, auditor, customer, caseRecord, memo };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("acceptRiskMemoService", () => {
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

  it("accepts memo and sets acceptedByUserId and acceptedAt", async () => {
    const { org, owner, memo } = await seedOrgWithMemo();

    const result = await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
    });

    expect(result.riskMemo.acceptedByUserId).toBe(owner.id);
    expect(result.riskMemo.acceptedAt).not.toBeNull();
  });

  it("writes RISK_MEMO_ACCEPTED audit", async () => {
    const { org, owner, memo } = await seedOrgWithMemo();

    await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
    });

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "RISK_MEMO_ACCEPTED" },
    });
    expect(audits).toHaveLength(1);
    const metadata = JSON.parse(audits[0].metadataJson ?? "{}");
    expect(metadata.acceptedByUserId).toBe(owner.id);
  });

  it("creates case note when createCaseNoteFromMemo is true", async () => {
    const { org, owner, memo, caseRecord } = await seedOrgWithMemo();

    const result = await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
      createCaseNoteFromMemo: true,
    });

    expect(result.caseNoteId).toBeDefined();
    const note = await prisma.caseNote.findFirst({
      where: { id: result.caseNoteId },
    });
    expect(note).not.toBeNull();
    expect(note?.complianceCaseId).toBe(caseRecord.id);
    expect(note?.body).toContain("AI Risk Memo Accepted");
  });

  it("cannot accept cross-org memo", async () => {
    const { org, owner, memo } = await seedOrgWithMemo();
    const orgB = await prisma.organization.create({
      data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
    });

    await expect(
      acceptRiskMemoService(ctx(owner.id, orgB.id, "OWNER"), {
        riskMemoId: memo.id,
      })
    ).rejects.toThrow("Risk memo not found");
  });

  it("cannot accept already accepted memo", async () => {
    const { org, owner, memo } = await seedOrgWithMemo();

    await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
    });

    await expect(
      acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        riskMemoId: memo.id,
      })
    ).rejects.toThrow("already been accepted");
  });

  it("does not create ApprovalDecision", async () => {
    const { org, owner, memo } = await seedOrgWithMemo();

    await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
    });

    const decisions = await prisma.approvalDecision.count({
      where: { organizationId: org.id },
    });
    expect(decisions).toBe(0);
  });

  it("does not change case status", async () => {
    const { org, owner, memo, caseRecord } = await seedOrgWithMemo();

    await acceptRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      riskMemoId: memo.id,
    });

    const updatedCase = await prisma.complianceCase.findFirst({
      where: { id: caseRecord.id },
    });
    expect(updatedCase?.status).toBe("OPEN");
  });

  it("auditor cannot accept", async () => {
    const { org, auditor, memo } = await seedOrgWithMemo();

    await expect(
      acceptRiskMemoService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"), {
        riskMemoId: memo.id,
      })
    ).rejects.toThrow("Forbidden: missing permission cases:update");
  });
});
