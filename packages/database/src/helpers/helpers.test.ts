import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../client";
import {
  getComplianceCaseForOrganization,
  listComplianceCasesForOrganization,
  createApprovalDecision,
  createAuditEvent,
} from "./index";
import {
  OrganizationStatus,
  UserStatus,
  CaseStatus,
  RiskLevel,
  ApprovalDecisionType,
} from "@prisma/client";

const TEST_ORG_A_NAME = "Test Org A";
const TEST_ORG_B_NAME = "Test Org B";

async function seedTestData() {
  const orgA = await prisma.organization.create({
    data: {
      name: TEST_ORG_A_NAME,
      slug: "test-org-a",
      status: OrganizationStatus.ACTIVE,
    },
  });

  const orgB = await prisma.organization.create({
    data: {
      name: TEST_ORG_B_NAME,
      slug: "test-org-b",
      status: OrganizationStatus.ACTIVE,
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: "test-a@example.com",
      name: "Test User A",
      status: UserStatus.ACTIVE,
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: "test-b@example.com",
      name: "Test User B",
      status: UserStatus.ACTIVE,
    },
  });

  const caseA = await prisma.complianceCase.create({
    data: {
      organizationId: orgA.id,
      title: "Case A",
      status: CaseStatus.OPEN,
      riskLevel: RiskLevel.LOW,
      openedByUserId: userA.id,
    },
  });

  const caseB = await prisma.complianceCase.create({
    data: {
      organizationId: orgB.id,
      title: "Case B",
      status: CaseStatus.IN_REVIEW,
      riskLevel: RiskLevel.HIGH,
      openedByUserId: userB.id,
    },
  });

  return { orgA, orgB, userA, userB, caseA, caseB };
}

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
    "User",
    "Organization",
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE 1=1`);
  }
}

describe("database helpers", () => {
  beforeAll(async () => {
    // Ensure connection is ready
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe("tenant isolation", () => {
    it("getComplianceCaseForOrganization does not return a case from another organization", async () => {
      const { orgA, caseB } = await seedTestData();

      const found = await getComplianceCaseForOrganization(orgA.id, caseB.id);
      expect(found).toBeNull();
    });

    it("listComplianceCasesForOrganization only returns cases for the given organization", async () => {
      const { orgA, caseA } = await seedTestData();

      const cases = await listComplianceCasesForOrganization(orgA.id);
      expect(cases).toHaveLength(1);
      expect(cases[0].id).toBe(caseA.id);
    });
  });

  describe("approval decision", () => {
    it("createApprovalDecision creates a decision", async () => {
      const { orgA, userA, caseA } = await seedTestData();

      const decision = await createApprovalDecision({
        organizationId: orgA.id,
        complianceCaseId: caseA.id,
        decision: ApprovalDecisionType.APPROVE,
        reason: "All checks passed",
        reviewerUserId: userA.id,
      });

      expect(decision.id).toBeDefined();
      expect(decision.decision).toBe(ApprovalDecisionType.APPROVE);
      expect(decision.reason).toBe("All checks passed");
      expect(decision.createdAt).toBeInstanceOf(Date);
    });

    it("approval decision has no updatedAt field (immutable)", async () => {
      const { orgA, userA, caseA } = await seedTestData();

      await createApprovalDecision({
        organizationId: orgA.id,
        complianceCaseId: caseA.id,
        decision: ApprovalDecisionType.REJECT,
        reason: "Insufficient evidence",
        reviewerUserId: userA.id,
      });

      const columns = await prisma.$queryRawUnsafe<
        Array<{ column_name: string }>
      >(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'ApprovalDecision' AND column_name = 'updatedAt'`
      );

      expect(columns).toHaveLength(0);
    });
  });

  describe("audit event", () => {
    it("createAuditEvent appends a record", async () => {
      const { orgA, userA } = await seedTestData();

      const event = await createAuditEvent({
        organizationId: orgA.id,
        actorUserId: userA.id,
        action: "TEST_ACTION",
        entityType: "TestEntity",
        metadataJson: JSON.stringify({ test: true }),
      });

      expect(event.id).toBeDefined();
      expect(event.action).toBe("TEST_ACTION");
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it("audit event has no updatedAt field (append-only)", async () => {
      const { orgA, userA } = await seedTestData();

      await createAuditEvent({
        organizationId: orgA.id,
        actorUserId: userA.id,
        action: "TEST_ACTION_2",
        entityType: "TestEntity",
      });

      const columns = await prisma.$queryRawUnsafe<
        Array<{ column_name: string }>
      >(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'AuditEvent' AND column_name = 'updatedAt'`
      );

      expect(columns).toHaveLength(0);
    });
  });
});
