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
import { importOnChainTransactionsCsvService } from "./onchain-transaction-import";
import type { ActorContext } from "./onchain-transaction-import";

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
    data: { name: "Tx Import Org", slug: "tx-import-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-tx@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-tx@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: analyst.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
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
  return { org, owner, analyst, wallet };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("onchain-transaction-import", () => {
  beforeAll(async () => await prisma.$connect());
  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });
  beforeEach(async () => await cleanupTestData());

  describe("importOnChainTransactionsCsvService", () => {
    it("imports valid rows", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: 15000,
          usdValue: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);

      const txs = await prisma.onChainTransaction.findMany({ where: { walletAddressId: wallet.id } });
      expect(txs.length).toBe(1);

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "ONCHAIN_TRANSACTIONS_IMPORTED" },
      });
      expect(audit).not.toBeNull();
    });

    it("skips duplicates", async () => {
      const { org, owner, wallet } = await seedOrg();
      await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      const result = await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it("rejects invalid direction", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "SIDEWAYS",
          assetSymbol: "USDC",
          amount: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("rejects negative amount", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: -100,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("rejects cross-org wallet", async () => {
      const { org, owner, wallet } = await seedOrg();
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b-tx", status: OrganizationStatus.ACTIVE },
      });
      const ownerB = await prisma.user.create({
        data: { email: "owner-b-tx@example.com", name: "Owner B", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      const result = await importOnChainTransactionsCsvService(ctx(ownerB.id, orgB.id, "OWNER"), [
        {
          network: "SOLANA",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("rejects wrong network for wallet", async () => {
      const { org, owner, wallet } = await seedOrg();
      const result = await importOnChainTransactionsCsvService(ctx(owner.id, org.id, "OWNER"), [
        {
          network: "ETHEREUM",
          walletAddress: wallet.address,
          txHash: "tx1",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: 15000,
          blockTime: new Date("2024-01-15T10:00:00Z"),
        },
      ]);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
    });
  });
});
