import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "./client";
import {
  OrganizationStatus,
  UserStatus,
  OrganizationRole,
  MembershipStatus,
  ProfileStatus,
} from "@prisma/client";
import { isProductionEnvironment, cleanupSeedData } from "./seed-cleanup";

async function cleanupAll() {
  const tables = [
    "AuditEvent",
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

describe("seed-cleanup", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupAll();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  describe("isProductionEnvironment", () => {
    it("returns true when NODE_ENV is production", () => {
      expect(isProductionEnvironment(undefined, "production")).toBe(true);
    });

    it("returns true for amazonaws.com URLs", () => {
      expect(isProductionEnvironment("postgresql://user:pass@x.amazonaws.com/db", undefined)).toBe(true);
    });

    it("returns true for neon.tech URLs", () => {
      expect(isProductionEnvironment("postgresql://user:pass@x.neon.tech/db", undefined)).toBe(true);
    });

    it("returns true for URLs containing prod", () => {
      expect(isProductionEnvironment("postgresql://user:pass@localhost/prod_db", undefined)).toBe(true);
    });

    it("returns true for URLs containing live", () => {
      expect(isProductionEnvironment("postgresql://user:pass@localhost/live_db", undefined)).toBe(true);
    });

    it("returns false for local dev URLs", () => {
      expect(isProductionEnvironment("postgresql://user:pass@localhost:5432/regops_ai", "development")).toBe(false);
    });

    it("returns false for test URLs", () => {
      expect(isProductionEnvironment("postgresql://user:pass@localhost:5432/regops_ai_web_test", "test")).toBe(false);
    });
  });

  describe("cleanupSeedData", () => {
    it("deletes only the seeded organization and its data", async () => {
      const seedOrg = await prisma.organization.create({
        data: { name: "Acme Remittance EU", slug: "acme-remittance-eu", status: OrganizationStatus.ACTIVE },
      });
      const otherOrg = await prisma.organization.create({
        data: { name: "Other Org", slug: "other-org", status: OrganizationStatus.ACTIVE },
      });

      const seedUser = await prisma.user.create({
        data: { email: "owner@acme-remittance.test", name: "Owner", status: UserStatus.ACTIVE },
      });
      const otherUser = await prisma.user.create({
        data: { email: "other@example.com", name: "Other", status: UserStatus.ACTIVE },
      });

      await prisma.organizationMember.create({
        data: { organizationId: seedOrg.id, userId: seedUser.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: otherOrg.id, userId: otherUser.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });

      await prisma.customerProfile.create({
        data: { organizationId: seedOrg.id, firstName: "Seed", lastName: "Customer", status: ProfileStatus.ACTIVE, riskLevel: "LOW" },
      });
      await prisma.customerProfile.create({
        data: { organizationId: otherOrg.id, firstName: "Other", lastName: "Customer", status: ProfileStatus.ACTIVE, riskLevel: "LOW" },
      });

      await cleanupSeedData(prisma);

      const seedOrgAfter = await prisma.organization.findUnique({ where: { id: seedOrg.id } });
      const otherOrgAfter = await prisma.organization.findUnique({ where: { id: otherOrg.id } });
      const seedUserAfter = await prisma.user.findUnique({ where: { id: seedUser.id } });
      const otherUserAfter = await prisma.user.findUnique({ where: { id: otherUser.id } });
      const seedMembers = await prisma.organizationMember.count({ where: { organizationId: seedOrg.id } });
      const otherMembers = await prisma.organizationMember.count({ where: { organizationId: otherOrg.id } });
      const seedCustomers = await prisma.customerProfile.count({ where: { organizationId: seedOrg.id } });
      const otherCustomers = await prisma.customerProfile.count({ where: { organizationId: otherOrg.id } });

      expect(seedOrgAfter).toBeNull();
      expect(otherOrgAfter).not.toBeNull();
      expect(seedUserAfter).toBeNull();
      expect(otherUserAfter).not.toBeNull();
      expect(seedMembers).toBe(0);
      expect(otherMembers).toBe(1);
      expect(seedCustomers).toBe(0);
      expect(otherCustomers).toBe(1);
    });

    it("does nothing when seeded organization does not exist", async () => {
      const otherOrg = await prisma.organization.create({
        data: { name: "Other Org", slug: "other-org", status: OrganizationStatus.ACTIVE },
      });

      await cleanupSeedData(prisma);

      const otherOrgAfter = await prisma.organization.findUnique({ where: { id: otherOrg.id } });
      expect(otherOrgAfter).not.toBeNull();
    });

    it("does not delete non-seed users", async () => {
      await prisma.organization.create({
        data: { name: "Acme Remittance EU", slug: "acme-remittance-eu", status: OrganizationStatus.ACTIVE },
      });
      const nonSeedUser = await prisma.user.create({
        data: { email: "dev@company.com", name: "Dev", status: UserStatus.ACTIVE },
      });

      await cleanupSeedData(prisma);

      const nonSeedUserAfter = await prisma.user.findUnique({ where: { id: nonSeedUser.id } });
      expect(nonSeedUserAfter).not.toBeNull();
    });
  });
});
