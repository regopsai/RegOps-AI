import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@regops-ai/database";
import {
  OrganizationStatus,
  UserStatus,
  OrganizationRole,
  MembershipStatus,
  ProfileStatus,
  RiskLevel,
} from "@regops-ai/database";
import {
  importWalletScreeningCsvService,
  runWalletScreeningService,
} from "./screening-service";
import type { ActorContext } from "./screening-service";

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
    data: { name: "Screening Org", slug: "screening-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-screen@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-screen@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  const auditor = await prisma.user.create({
    data: { email: "auditor-screen@example.com", name: "Auditor", status: UserStatus.ACTIVE },
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
  const wallet = await prisma.walletAddress.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      network: "SOLANA",
      address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      createdByUserId: owner.id,
      status: "ACTIVE",
    },
  });
  return { org, owner, analyst, auditor, wallet };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("screening-service", () => {
  beforeAll(async () => await prisma.$connect());
  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });
  beforeEach(async () => await cleanupTestData());

  describe("importWalletScreeningCsvService", () => {
    it("imports valid screening CSV", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importWalletScreeningCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          provider: "manual",
          riskScore: 85,
          riskLevel: "HIGH",
          categories: "mixer,sanctioned",
          labels: "high_risk",
          summary: "High risk",
          providerRunId: "run-001",
        },
      ]);
      expect(result.imported).toBe(1);
      expect(result.failed).toBe(0);

      const runs = await prisma.walletScreeningRun.findMany({ where: { walletAddressId: wallet.id } });
      expect(runs.length).toBe(1);
      expect(runs[0].riskLevel).toBe("HIGH");

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "WALLET_SCREENING_RUN_CREATED" },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects unknown wallet", async () => {
      const { org, owner } = await seedOrg();
      const result = await importWalletScreeningCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          address: "UnknownAddress1234567890123456789012345678",
          provider: "manual",
          riskLevel: "HIGH",
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("rejects invalid riskScore", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importWalletScreeningCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          address: wallet.address,
          provider: "manual",
          riskScore: 150,
          riskLevel: "HIGH",
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("rejects invalid riskLevel", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importWalletScreeningCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          address: wallet.address,
          provider: "manual",
          riskLevel: "EXTREME",
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("auditor cannot import", async () => {
      const { org, auditor, wallet } = await seedOrg();
      await expect(
        importWalletScreeningCsvService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"), [
          {
            network: "SOLANA",
            address: wallet.address,
            provider: "manual",
            riskLevel: "HIGH",
          },
        ])
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("runWalletScreeningService", () => {
    it("runs mock screening in dev", async () => {
      const { org, owner, wallet } = await seedOrg();
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      (process.env as Record<string, string>).NODE_ENV = "development";
      const run = await runWalletScreeningService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      expect(run.provider).toBe("mock");
      expect(run.status).toBe("COMPLETED");

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "WALLET_SCREENING_RUN_CREATED" },
      });
      expect(audit).not.toBeNull();
    });

    it("fails for manual provider", async () => {
      const { org, owner, wallet } = await seedOrg();
      process.env.ONCHAIN_RISK_PROVIDER = "manual";
      await expect(
        runWalletScreeningService(ctx(owner.id, org.id, "OWNER"), wallet.id)
      ).rejects.toThrow("Manual provider does not support live screening");

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "WALLET_SCREENING_RUN_FAILED" },
      });
      expect(audit).not.toBeNull();
    });
  });
});
