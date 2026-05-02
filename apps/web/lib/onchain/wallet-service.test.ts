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
import {
  createWalletAddressService,
  archiveWalletAddressService,
  listWalletAddressesService,
  getWalletAddressService,
} from "./wallet-service";
import type { ActorContext } from "./wallet-service";

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

async function seedOrgWithUsers() {
  const org = await prisma.organization.create({
    data: { name: "Wallet Test Org", slug: "wallet-test-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-wallet@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-wallet@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  const auditor = await prisma.user.create({
    data: { email: "auditor-wallet@example.com", name: "Auditor", status: UserStatus.ACTIVE },
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
  const business = await prisma.businessProfile.create({
    data: { organizationId: org.id, legalName: "Test Biz", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Test Case", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });
  return { org, owner, analyst, auditor, customer, business, caseRecord };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("wallet-service", () => {
  beforeAll(async () => await prisma.$connect());
  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });
  beforeEach(async () => await cleanupTestData());

  describe("createWalletAddressService", () => {
    it("creates a wallet linked to customer", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        label: "Primary",
        customerProfileId: customer.id,
      });
      expect(wallet.network).toBe("SOLANA");
      expect(wallet.address).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
      expect(wallet.customerProfileId).toBe(customer.id);

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "WALLET_ADDRESS_CREATED" },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects duplicate wallet in same org/network", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      await expect(
        createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          customerProfileId: customer.id,
        })
      ).rejects.toThrow();
    });

    it("allows same address in different orgs", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b-wallet", status: OrganizationStatus.ACTIVE },
      });
      const ownerB = await prisma.user.create({
        data: { email: "owner-b-wallet@example.com", name: "Owner B", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });

      await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const customerB = await prisma.customerProfile.create({
        data: { organizationId: orgB.id, firstName: "Bob", lastName: "Jones", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
      });
      const walletB = await createWalletAddressService(ctx(ownerB.id, orgB.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customerB.id,
      });
      expect(walletB.organizationId).toBe(orgB.id);
    });

    it("rejects without onchain:write permission", async () => {
      const { org, auditor, customer } = await seedOrgWithUsers();
      await expect(
        createWalletAddressService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"), {
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          customerProfileId: customer.id,
        })
      ).rejects.toThrow("Forbidden");
    });

    it("analyst can create wallet", async () => {
      const { org, analyst, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(analyst.id, org.id, "COMPLIANCE_ANALYST"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      expect(wallet.id).toBeDefined();
    });

    it("rejects if linked case subject mismatch", async () => {
      const { org, owner, customer, business } = await seedOrgWithUsers();
      const caseWithBusiness = await prisma.complianceCase.create({
        data: { organizationId: org.id, businessProfileId: business.id, title: "Biz Case", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
      });
      await expect(
        createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          customerProfileId: customer.id,
          complianceCaseId: caseWithBusiness.id,
        })
      ).rejects.toThrow("does not match");
    });
  });

  describe("archiveWalletAddressService", () => {
    it("archives a wallet and writes audit", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      await archiveWalletAddressService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      const updated = await prisma.walletAddress.findUnique({ where: { id: wallet.id } });
      expect(updated?.status).toBe("ARCHIVED");

      const audit = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "WALLET_ADDRESS_ARCHIVED" },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects cross-org archive", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b-archive", status: OrganizationStatus.ACTIVE },
      });
      const ownerB = await prisma.user.create({
        data: { email: "owner-b-archive@example.com", name: "Owner B", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      await expect(
        archiveWalletAddressService(ctx(ownerB.id, orgB.id, "OWNER"), wallet.id)
      ).rejects.toThrow("not found");
    });
  });

  describe("listWalletAddressesService", () => {
    it("lists wallets for org only", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const wallets = await listWalletAddressesService(ctx(owner.id, org.id, "OWNER"));
      expect(wallets.length).toBe(1);
    });

    it("auditor can list wallets", async () => {
      const { org, owner, auditor, customer } = await seedOrgWithUsers();
      await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const wallets = await listWalletAddressesService(ctx(auditor.id, org.id, "READ_ONLY_AUDITOR"));
      expect(wallets.length).toBe(1);
    });
  });

  describe("getWalletAddressService", () => {
    it("returns wallet with screening runs and transactions", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const found = await getWalletAddressService(ctx(owner.id, org.id, "OWNER"), wallet.id);
      expect(found?.id).toBe(wallet.id);
    });

    it("returns null for cross-org wallet", async () => {
      const { org, owner, customer } = await seedOrgWithUsers();
      const wallet = await createWalletAddressService(ctx(owner.id, org.id, "OWNER"), {
        network: "SOLANA",
        address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        customerProfileId: customer.id,
      });
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b-get", status: OrganizationStatus.ACTIVE },
      });
      const ownerB = await prisma.user.create({
        data: { email: "owner-b-get@example.com", name: "Owner B", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      const found = await getWalletAddressService(ctx(ownerB.id, orgB.id, "OWNER"), wallet.id);
      expect(found).toBeNull();
    });
  });
});
