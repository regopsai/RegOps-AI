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
import { listTransactionsService, getTransactionService } from "./transaction-service";
import type { ActorContext } from "./transaction-service";

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

async function seedTwoOrgs() {
  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a", status: OrganizationStatus.ACTIVE },
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
  });

  const ownerA = await prisma.user.create({
    data: { email: "owner-a@example.com", name: "Owner A", status: UserStatus.ACTIVE },
  });
  const ownerB = await prisma.user.create({
    data: { email: "owner-b@example.com", name: "Owner B", status: UserStatus.ACTIVE },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgA.id, userId: ownerA.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
    ],
  });

  const customerA = await prisma.customerProfile.create({
    data: { organizationId: orgA.id, firstName: "Alice", lastName: "Smith", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const customerB = await prisma.customerProfile.create({
    data: { organizationId: orgB.id, firstName: "Bob", lastName: "Jones", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.HIGH },
  });

  const txA = await prisma.transaction.create({
    data: {
      organizationId: orgA.id,
      customerProfileId: customerA.id,
      externalReference: "TXN-A",
      direction: "INBOUND",
      amount: 5000,
      currency: "USD",
      counterpartyName: "Alice",
      occurredAt: new Date("2024-01-15T10:00:00Z"),
    },
  });
  const txB = await prisma.transaction.create({
    data: {
      organizationId: orgB.id,
      customerProfileId: customerB.id,
      externalReference: "TXN-B",
      direction: "OUTBOUND",
      amount: 10000,
      currency: "EUR",
      counterpartyName: "Bob",
      occurredAt: new Date("2024-01-16T10:00:00Z"),
    },
  });

  return { orgA, orgB, ownerA, ownerB, customerA, customerB, txA, txB };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("transaction-service", () => {
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

  describe("listTransactionsService", () => {
    it("returns only org A transactions", async () => {
      const { orgA, ownerA, txA } = await seedTwoOrgs();
      const result = await listTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(txA.id);
    });

    it("filters by direction", async () => {
      const { orgA, ownerA } = await seedTwoOrgs();
      const result = await listTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        direction: "OUTBOUND",
      });
      expect(result).toHaveLength(0);
    });

    it("filters by currency", async () => {
      const { orgA, ownerA } = await seedTwoOrgs();
      const result = await listTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        currency: "EUR",
      });
      expect(result).toHaveLength(0);
    });

    it("searches by externalReference", async () => {
      const { orgA, ownerA } = await seedTwoOrgs();
      const result = await listTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        search: "TXN-A",
      });
      expect(result).toHaveLength(1);
    });

    it("searches by counterpartyName", async () => {
      const { orgA, ownerA } = await seedTwoOrgs();
      const result = await listTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        search: "Alice",
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("getTransactionService", () => {
    it("returns transaction for org A", async () => {
      const { orgA, ownerA, txA } = await seedTwoOrgs();
      const result = await getTransactionService(ctx(ownerA.id, orgA.id, "OWNER"), txA.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(txA.id);
    });

    it("does not return org B transaction", async () => {
      const { orgA, orgB, ownerA, txB } = await seedTwoOrgs();
      const result = await getTransactionService(ctx(ownerA.id, orgA.id, "OWNER"), txB.id);
      expect(result).toBeNull();
    });
  });
});
