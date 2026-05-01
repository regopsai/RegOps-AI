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
import { generateRiskMemoService } from "./risk-memo-service";
import { MockProvider } from "@regops-ai/ai";
import type { ActorContext } from "./risk-memo-service";

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

async function seedOrgWithCase() {
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
      nationality: "US",
      countryOfResidence: "US",
    },
  });

  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Case 1", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });

  return { org, owner, analyst, auditor, customer, caseRecord };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("generateRiskMemoService", () => {
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

  it("creates AgentRun RUNNING then SUCCEEDED and RiskMemo", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    const memo = await generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      complianceCaseId: caseRecord.id,
      providerOverride: mockProvider,
    });

    expect(memo.executiveSummary).toBeTruthy();
    expect(memo.complianceCaseId).toBe(caseRecord.id);

    const agentRun = await prisma.agentRun.findFirst({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(agentRun).not.toBeNull();
    expect(agentRun?.status).toBe("SUCCEEDED");
    expect(agentRun?.agentType).toBe("RISK_MEMO");
    expect(agentRun?.promptVersion).toBe("risk-memo-v1");
  });

  it("writes RISK_MEMO_GENERATED audit", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    await generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      complianceCaseId: caseRecord.id,
      providerOverride: mockProvider,
    });

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "RISK_MEMO_GENERATED" },
    });
    expect(audits).toHaveLength(1);
    const metadata = JSON.parse(audits[0].metadataJson ?? "{}");
    expect(metadata.complianceCaseId).toBe(caseRecord.id);
    expect(metadata.provider).toBe("mock");
    expect(metadata.promptVersion).toBe("risk-memo-v1");
    expect(metadata.recommendedAction).toBeDefined();
  });

  it("failed provider updates AgentRun FAILED and writes audit", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const failingProvider = new MockProvider({ invalid: true } as unknown as Record<string, unknown>);

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseRecord.id,
        providerOverride: failingProvider,
      })
    ).rejects.toThrow();

    const agentRun = await prisma.agentRun.findFirst({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(agentRun).not.toBeNull();
    expect(agentRun?.status).toBe("FAILED");
    expect(agentRun?.errorMessage).toBeTruthy();

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "RISK_MEMO_GENERATION_FAILED" },
    });
    expect(audits).toHaveLength(1);
  });

  it("does not create ApprovalDecision", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    await generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      complianceCaseId: caseRecord.id,
      providerOverride: mockProvider,
    });

    const decisions = await prisma.approvalDecision.count({
      where: { organizationId: org.id },
    });
    expect(decisions).toBe(0);
  });

  it("does not change case status", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    await generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
      complianceCaseId: caseRecord.id,
      providerOverride: mockProvider,
    });

    const updatedCase = await prisma.complianceCase.findFirst({
      where: { id: caseRecord.id },
    });
    expect(updatedCase?.status).toBe("OPEN");
  });

  it("auditor cannot generate", async () => {
    const { org, auditor, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    await expect(
      generateRiskMemoService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"), {
        complianceCaseId: caseRecord.id,
        providerOverride: mockProvider,
      })
    ).rejects.toThrow("Forbidden: missing permission ai:risk_memo");
  });

  it("analyst can generate", async () => {
    const { org, analyst, caseRecord } = await seedOrgWithCase();
    const mockProvider = new MockProvider();

    const memo = await generateRiskMemoService(ctx(analyst.id, org.id, "COMPLIANCE_ANALYST"), {
      complianceCaseId: caseRecord.id,
      providerOverride: mockProvider,
    });

    expect(memo).toBeDefined();
  });

  it("rejects cross-org case", async () => {
    const { org, owner } = await seedOrgWithCase();
    const orgB = await prisma.organization.create({
      data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
    });
    const caseB = await prisma.complianceCase.create({
      data: { organizationId: orgB.id, title: "Case B", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
    });
    const mockProvider = new MockProvider();

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseB.id,
        providerOverride: mockProvider,
      })
    ).rejects.toThrow("Case not found");
  });

  it("provider config error creates FAILED AgentRun and writes audit", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_MODEL;

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseRecord.id,
      })
    ).rejects.toThrow();

    process.env.AI_PROVIDER = originalProvider;
    if (originalModel) process.env.AI_MODEL = originalModel;

    const agentRun = await prisma.agentRun.findFirst({
      where: { organizationId: org.id, complianceCaseId: caseRecord.id },
    });
    expect(agentRun).not.toBeNull();
    expect(agentRun?.status).toBe("FAILED");
    expect(agentRun?.errorMessage).toBeTruthy();

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "RISK_MEMO_GENERATION_FAILED" },
    });
    expect(audits).toHaveLength(1);
  });

  it("provider config error does not create RiskMemo", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_MODEL;

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseRecord.id,
      })
    ).rejects.toThrow();

    process.env.AI_PROVIDER = originalProvider;
    if (originalModel) process.env.AI_MODEL = originalModel;

    const memos = await prisma.riskMemo.count({
      where: { organizationId: org.id },
    });
    expect(memos).toBe(0);
  });

  it("provider config error does not create ApprovalDecision", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_MODEL;

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseRecord.id,
      })
    ).rejects.toThrow();

    process.env.AI_PROVIDER = originalProvider;
    if (originalModel) process.env.AI_MODEL = originalModel;

    const decisions = await prisma.approvalDecision.count({
      where: { organizationId: org.id },
    });
    expect(decisions).toBe(0);
  });

  it("provider config error does not change case status", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_MODEL;

    await expect(
      generateRiskMemoService(ctx(owner.id, org.id, "OWNER"), {
        complianceCaseId: caseRecord.id,
      })
    ).rejects.toThrow();

    process.env.AI_PROVIDER = originalProvider;
    if (originalModel) process.env.AI_MODEL = originalModel;

    const updatedCase = await prisma.complianceCase.findFirst({
      where: { id: caseRecord.id },
    });
    expect(updatedCase?.status).toBe("OPEN");
  });
});
