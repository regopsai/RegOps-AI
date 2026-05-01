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
  makeFinalDecisionService,
  listApprovalDecisionsService,
} from "./decision-service";
import type { ActorContext } from "./decision-service";

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
    data: { name: "Decision Org", slug: "decision-org", status: OrganizationStatus.ACTIVE },
  });

  const owner = await prisma.user.create({
    data: { email: "owner@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const manager = await prisma.user.create({
    data: { email: "manager@example.com", name: "Manager", status: UserStatus.ACTIVE },
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
      { organizationId: org.id, userId: manager.id, role: OrganizationRole.COMPLIANCE_MANAGER, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: analyst.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: auditor.id, role: OrganizationRole.READ_ONLY_AUDITOR, status: MembershipStatus.ACTIVE },
    ],
  });

  const customer = await prisma.customerProfile.create({
    data: {
      organizationId: org.id,
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.MEDIUM,
    },
  });

  const business = await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      legalName: "Business Ltd",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.HIGH,
    },
  });

  const openCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      title: "Open Case",
      status: CaseStatus.OPEN,
      riskLevel: RiskLevel.MEDIUM,
      openedByUserId: owner.id,
    },
  });

  const inReviewCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      businessProfileId: business.id,
      title: "In Review Case",
      status: CaseStatus.IN_REVIEW,
      riskLevel: RiskLevel.HIGH,
      openedByUserId: owner.id,
    },
  });

  const approvedCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      title: "Approved Case",
      status: CaseStatus.APPROVED,
      riskLevel: RiskLevel.LOW,
      openedByUserId: owner.id,
    },
  });

  const rejectedCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      title: "Rejected Case",
      status: CaseStatus.REJECTED,
      riskLevel: RiskLevel.HIGH,
      openedByUserId: owner.id,
    },
  });

  const closedCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      title: "Closed Case",
      status: CaseStatus.CLOSED,
      riskLevel: RiskLevel.LOW,
      openedByUserId: owner.id,
    },
  });

  const document = await prisma.document.create({
    data: {
      organizationId: org.id,
      complianceCaseId: openCase.id,
      originalFileName: "passport.pdf",
      type: "ID_DOCUMENT",
      storageKey: "storage-key-123",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedByUserId: owner.id,
    },
  });

  const transaction = await prisma.transaction.create({
    data: {
      organizationId: org.id,
      complianceCaseId: openCase.id,
      customerProfileId: customer.id,
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: 1000,
      currency: "USD",
      counterpartyName: "Counterparty A",
      occurredAt: new Date("2024-01-15"),
    },
  });

  const riskSignal = await prisma.riskSignal.create({
    data: {
      organizationId: org.id,
      complianceCaseId: openCase.id,
      customerProfileId: customer.id,
      ruleId: "HIGH_VALUE_TRANSACTION",
      title: "High Value Transaction",
      description: "Transaction exceeds threshold",
      severity: "HIGH",
    },
  });

  const note = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: openCase.id,
      authorUserId: owner.id,
      body: "Initial review note",
      visibility: "INTERNAL",
    },
  });

  return {
    org, owner, manager, analyst, auditor,
    customer, business,
    openCase, inReviewCase, approvedCase, rejectedCase, closedCase,
    document, transaction, riskSignal, note,
  };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("decision-service", () => {
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

  describe("makeFinalDecisionService", () => {
    it("creates APPROVE decision and updates case to APPROVED", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "All checks passed",
      });

      expect(result.decision).toBe("APPROVE");
      expect(result.reason).toBe("All checks passed");
      expect(result.reviewerUserId).toBe(owner.id);
      expect(result.evidenceSnapshotJson).toBeTruthy();

      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("APPROVED");
      expect(updatedCase?.closedAt).toBeTruthy();

      const audit = await prisma.auditEvent.findFirst({
        where: { action: "CASE_FINAL_DECISION", entityId: openCase.id },
      });
      expect(audit).toBeTruthy();
      expect(audit?.metadataJson).toContain("APPROVE");
    });

    it("creates REJECT decision and updates case to REJECTED", async () => {
      const { org, manager, inReviewCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(manager.id, org.id, OrganizationRole.COMPLIANCE_MANAGER), {
        caseId: inReviewCase.id,
        decision: "REJECT",
        reason: "Fraudulent documents",
      });

      expect(result.decision).toBe("REJECT");
      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: inReviewCase.id } });
      expect(updatedCase?.status).toBe("REJECTED");
      expect(updatedCase?.closedAt).toBeTruthy();
    });

    it("creates ESCALATE decision and updates case to ESCALATED", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "ESCALATE",
        reason: "Requires senior review",
      });

      expect(result.decision).toBe("ESCALATE");
      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("ESCALATED");
      expect(updatedCase?.closedAt).toBeNull();
    });

    it("creates REQUEST_MORE_INFORMATION decision and updates case to IN_REVIEW", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "REQUEST_MORE_INFORMATION",
        reason: "Missing bank statements",
      });

      expect(result.decision).toBe("REQUEST_MORE_INFORMATION");
      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("IN_REVIEW");
      expect(updatedCase?.closedAt).toBeNull();
    });

    it("creates CLOSE_NO_ACTION decision and updates case to CLOSED", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "CLOSE_NO_ACTION",
        reason: "No issues found",
      });

      expect(result.decision).toBe("CLOSE_NO_ACTION");
      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("CLOSED");
      expect(updatedCase?.closedAt).toBeTruthy();
    });

    it("rejects without cases:final_decision permission", async () => {
      const { org, analyst, openCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(analyst.id, org.id, OrganizationRole.COMPLIANCE_ANALYST), {
          caseId: openCase.id,
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Forbidden: missing permission cases:final_decision");
    });

    it("rejects for READ_ONLY_AUDITOR", async () => {
      const { org, auditor, openCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(auditor.id, org.id, OrganizationRole.READ_ONLY_AUDITOR), {
          caseId: openCase.id,
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Forbidden: missing permission cases:final_decision");
    });

    it("rejects when case is APPROVED", async () => {
      const { org, owner, approvedCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: approvedCase.id,
          decision: "REJECT",
          reason: "Should fail",
        })
      ).rejects.toThrow("Cannot make final decision: case is already APPROVED");
    });

    it("rejects when case is REJECTED", async () => {
      const { org, owner, rejectedCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: rejectedCase.id,
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Cannot make final decision: case is already REJECTED");
    });

    it("rejects when case is CLOSED", async () => {
      const { org, owner, closedCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: closedCase.id,
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Cannot make final decision: case is already CLOSED");
    });

    it("rejects when case does not exist", async () => {
      const { org, owner } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: "non-existent-case-id",
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Case not found");
    });

    it("rejects when case belongs to another organization", async () => {
      const { org: orgA, owner: ownerA } = await seedOrgWithCase();
      const orgB = await prisma.organization.create({
        data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
      });
      const ownerB = await prisma.user.create({
        data: { email: "owner-b@example.com", name: "Owner B", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      });

      const caseB = await prisma.complianceCase.create({
        data: {
          organizationId: orgB.id,
          title: "Case B",
          status: CaseStatus.OPEN,
          riskLevel: RiskLevel.LOW,
          openedByUserId: ownerB.id,
        },
      });

      await expect(
        makeFinalDecisionService(ctx(ownerA.id, orgA.id, OrganizationRole.OWNER), {
          caseId: caseB.id,
          decision: "APPROVE",
          reason: "Should fail",
        })
      ).rejects.toThrow("Case not found");
    });

    it("rejects empty reason", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: openCase.id,
          decision: "APPROVE",
          reason: "",
        })
      ).rejects.toThrow("Reason is required");
    });

    it("stores a safe evidence snapshot without sensitive fields", async () => {
      const { org, owner, openCase, document, transaction, riskSignal, note } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "Verified all evidence",
      });

      const snapshot = JSON.parse(result.evidenceSnapshotJson ?? "{}") as Record<string, unknown>;
      expect(snapshot.case).toBeDefined();
      expect(snapshot.case).toMatchObject({
        id: openCase.id,
        title: openCase.title,
        status: "OPEN",
      });
      expect(snapshot.subject).toBeDefined();
      expect(snapshot.subject).toMatchObject({ type: "individual" });

      // Documents should not contain extractedText or storageKey
      expect(Array.isArray(snapshot.documents)).toBe(true);
      expect(snapshot.documents).toHaveLength(1);
      const doc = (snapshot.documents as Record<string, unknown>[])[0];
      expect(doc.id).toBe(document.id);
      expect(doc.filename).toBe("passport.pdf");
      expect(doc.originalFileName).toBeUndefined();
      expect(doc).not.toHaveProperty("storageKey");
      expect(doc).not.toHaveProperty("extractedText");

      // Transactions should not contain sensitive metadata
      expect(snapshot.transactions).toBeDefined();
      const txData = snapshot.transactions as Record<string, unknown>;
      expect(txData.count).toBe(1);
      expect(Array.isArray(txData.latest)).toBe(true);
      const tx = (txData.latest as Record<string, unknown>[])[0];
      expect(tx.id).toBe(transaction.id);
      expect(tx).not.toHaveProperty("metadataJson");

      // Risk signals should not contain full description
      expect(Array.isArray(snapshot.riskSignals)).toBe(true);
      const rs = (snapshot.riskSignals as Record<string, unknown>[])[0];
      expect(rs.id).toBe(riskSignal.id);
      expect(rs.title).toBe("High Value Transaction");
      expect(rs).not.toHaveProperty("description");

      // Notes should only have count and IDs, no bodies
      expect(snapshot.notes).toBeDefined();
      const notesData = snapshot.notes as Record<string, unknown>;
      expect(notesData.count).toBe(1);
      expect(notesData.noteIds).toContain(note.id);
      expect(notesData).not.toHaveProperty("bodies");

      // Decision metadata
      expect(snapshot.decisionMetadata).toBeDefined();
      const dm = snapshot.decisionMetadata as Record<string, unknown>;
      expect(dm.decision).toBe("APPROVE");
      expect(dm.reasonLength).toBe(21);
      expect(dm.reviewerUserId).toBe(owner.id);
    });

    it("lists approval decisions for a case", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "All good",
      });

      const decisions = await listApprovalDecisionsService(ctx(owner.id, org.id, OrganizationRole.OWNER), openCase.id);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision).toBe("APPROVE");
      expect(decisions[0].reviewer.name).toBe("Owner");
    });

    it("rejects listApprovalDecisions for non-existent case", async () => {
      const { org, owner } = await seedOrgWithCase();
      await expect(
        listApprovalDecisionsService(ctx(owner.id, org.id, OrganizationRole.OWNER), "non-existent")
      ).rejects.toThrow("Case not found");
    });

    it("allows COMPLIANCE_MANAGER to make final decisions", async () => {
      const { org, manager, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(manager.id, org.id, OrganizationRole.COMPLIANCE_MANAGER), {
        caseId: openCase.id,
        decision: "CLOSE_NO_ACTION",
        reason: "Manager approved closure",
      });
      expect(result.decision).toBe("CLOSE_NO_ACTION");
    });
  });
});
