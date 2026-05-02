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
  WalletAddressStatus,
  BlockchainNetwork,
  OnChainTransactionDirection,
} from "@regops-ai/database";
import {
  runOnChainRiskChecksForWalletService,
  runOnChainRiskChecksForCaseService,
} from "./onchain-risk-service";
import type { ActorContext } from "./onchain-risk-service";

async function cleanupTestData() {
  const tables = [
    "AuditEvent",
    "OnChainTransaction",
    "WalletScreeningRun",
    "WalletAddress",
    "ApprovalDecision",
    "RiskMemo",
    "RiskAssessment",
    "RiskSignal",
    "CaseNote",
    "ComplianceCase",
    "Transaction",
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

async function seedOrg() {
  const org = await prisma.organization.create({
    data: { name: "Risk Org", slug: "risk-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-risk@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-risk@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  const auditor = await prisma.user.create({
    data: { email: "auditor-risk@example.com", name: "Auditor", status: UserStatus.ACTIVE },
  });
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: analyst.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: auditor.id, role: OrganizationRole.READ_ONLY_AUDITOR, status: MembershipStatus.ACTIVE },
    ],
  });
  const customer = await prisma.customerProfile.create({
    data: { organizationId: org.id, firstName: "Alice", lastName: "Smith", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Risk Case", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });
  const wallet = await prisma.walletAddress.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      complianceCaseId: caseRecord.id,
      network: BlockchainNetwork.SOLANA,
      address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      createdByUserId: owner.id,
      status: WalletAddressStatus.ACTIVE,
    },
  });
  return { org, owner, analyst, auditor, customer, caseRecord, wallet };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("onchain-risk-service", () => {
  beforeAll(async () => await prisma.$connect());
  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });
  beforeEach(async () => await cleanupTestData());

  describe("runOnChainRiskChecksForWalletService", () => {
    it("creates risk signals from screening", async () => {
      const { org, owner, wallet } = await seedOrg();
      await prisma.walletScreeningRun.create({
        data: {
          organizationId: org.id,
          walletAddressId: wallet.id,
          provider: "manual",
          status: "COMPLETED",
          riskScore: 85,
          riskLevel: RiskLevel.HIGH,
          categoriesJson: JSON.stringify(["mixer"]),
          labelsJson: JSON.stringify(["high_risk"]),
          screenedAt: new Date(),
        },
      });
      const result = await runOnChainRiskChecksForWalletService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      expect(result.created).toBeGreaterThanOrEqual(1);

      const signals = await prisma.riskSignal.findMany({ where: { walletAddressId: wallet.id } });
      expect(signals.length).toBeGreaterThanOrEqual(1);

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "ONCHAIN_RISK_SIGNALS_GENERATED" },
      });
      expect(audit).not.toBeNull();
    });

    it("is idempotent on repeated runs", async () => {
      const { org, owner, wallet } = await seedOrg();
      await prisma.walletScreeningRun.create({
        data: {
          organizationId: org.id,
          walletAddressId: wallet.id,
          provider: "manual",
          status: "COMPLETED",
          riskScore: 85,
          riskLevel: RiskLevel.HIGH,
          categoriesJson: JSON.stringify(["mixer"]),
          screenedAt: new Date(),
        },
      });
      const first = await runOnChainRiskChecksForWalletService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      const second = await runOnChainRiskChecksForWalletService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(first.created);
    });

    it("rejects without onchain:screen permission", async () => {
      const { org, auditor, wallet } = await seedOrg();
      await expect(
        runOnChainRiskChecksForWalletService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"), wallet.id)
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("runOnChainRiskChecksForCaseService", () => {
    it("creates case-level risk signals", async () => {
      const { org, owner, caseRecord, wallet } = await seedOrg();
      await prisma.walletScreeningRun.create({
        data: {
          organizationId: org.id,
          walletAddressId: wallet.id,
          provider: "manual",
          status: "COMPLETED",
          riskScore: 85,
          riskLevel: RiskLevel.HIGH,
          categoriesJson: JSON.stringify(["mixer"]),
          screenedAt: new Date(),
        },
      });
      const result = await runOnChainRiskChecksForCaseService(ctx(owner.id, org.id, "OWNER"), caseRecord.id);
      expect(result.created).toBeGreaterThanOrEqual(1);

      const signals = await prisma.riskSignal.findMany({ where: { complianceCaseId: caseRecord.id } });
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects cross-org case", async () => {
      const { org, owner } = await seedOrg();
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b-risk", status: OrganizationStatus.ACTIVE },
      });
      const caseB = await prisma.complianceCase.create({
        data: { organizationId: orgB.id, title: "Case B", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
      });
      await expect(
        runOnChainRiskChecksForCaseService(ctx(owner.id, org.id, "OWNER"), caseB.id)
      ).rejects.toThrow("not found");
    });
  });
});
