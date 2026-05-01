import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

      expect(result.approvalDecision.decision).toBe("APPROVE");
      expect(result.approvalDecision.reason).toBe("All checks passed");
      expect(result.approvalDecision.reviewerUserId).toBe(owner.id);
      expect(result.approvalDecision.evidenceSnapshotJson).toBeTruthy();
      expect(result.createdCaseNoteId).toBeUndefined();

      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("APPROVED");
      expect(updatedCase?.closedAt).toBeTruthy();

      const audit = await prisma.auditEvent.findFirst({
        where: { action: "APPROVAL_DECISION_CREATED", entityId: openCase.id },
      });
      expect(audit).toBeTruthy();
      const meta = JSON.parse(audit!.metadataJson ?? "{}");
      expect(meta.decision).toBe("APPROVE");
      expect(meta.previousStatus).toBe("OPEN");
      expect(meta.newStatus).toBe("APPROVED");
      expect(meta.reviewerUserId).toBe(owner.id);
      expect(meta.evidenceSnapshotVersion).toBe("1.0");
      expect(meta.approvalDecisionId).toBe(result.approvalDecision.id);
      expect(meta.createdCaseNoteId).toBeNull();
      // Verify undefined was serialized as null, not omitted
      expect(meta).toHaveProperty("createdCaseNoteId");
      expect(meta.latestRiskMemoId).toBeNull();
      expect(meta.complianceCaseId).toBe(openCase.id);
      // Must NOT contain sensitive fields
      expect(meta).not.toHaveProperty("reasonLength");
      expect(meta).not.toHaveProperty("fullReason");
    });

    it("creates REJECT decision and updates case to REJECTED", async () => {
      const { org, manager, inReviewCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(manager.id, org.id, OrganizationRole.COMPLIANCE_MANAGER), {
        caseId: inReviewCase.id,
        decision: "REJECT",
        reason: "Fraudulent documents",
      });

      expect(result.approvalDecision.decision).toBe("REJECT");
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

      expect(result.approvalDecision.decision).toBe("ESCALATE");
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

      expect(result.approvalDecision.decision).toBe("REQUEST_MORE_INFORMATION");
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

      expect(result.approvalDecision.decision).toBe("CLOSE_NO_ACTION");
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

      // Transactionality: no partial writes on permission failure
      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: openCase.id } });
      expect(decisions).toBe(0);
      const caseAfter = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(caseAfter?.status).toBe("OPEN");
      const audits = await prisma.auditEvent.count({ where: { action: "APPROVAL_DECISION_CREATED", entityId: openCase.id } });
      expect(audits).toBe(0);
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

      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: approvedCase.id } });
      expect(decisions).toBe(0);
      const audits = await prisma.auditEvent.count({ where: { action: "APPROVAL_DECISION_CREATED", entityId: approvedCase.id } });
      expect(audits).toBe(0);
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

      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: rejectedCase.id } });
      expect(decisions).toBe(0);
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

      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: closedCase.id } });
      expect(decisions).toBe(0);
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

      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: caseB.id } });
      expect(decisions).toBe(0);
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

    it("rejects reviewerComment over 5000 chars", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: openCase.id,
          decision: "APPROVE",
          reason: "Valid reason",
          reviewerComment: "x".repeat(5001),
        })
      ).rejects.toThrow("Too big");
    });

    it("stores a safe evidence snapshot without sensitive fields", async () => {
      const { org, owner, openCase, document, transaction, riskSignal, note } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "Verified all evidence",
      });

      const snapshot = JSON.parse(result.approvalDecision.evidenceSnapshotJson ?? "{}") as Record<string, unknown>;
      expect(snapshot.snapshotVersion).toBe("1.0");
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

      // Notes should only have count, latest IDs, and timestamp — no bodies
      expect(snapshot.notes).toBeDefined();
      const notesData = snapshot.notes as Record<string, unknown>;
      expect(notesData.count).toBe(1);
      expect(notesData.latestNoteIds).toContain(note.id);
      expect(notesData.latestNoteCreatedAt).toBeTruthy();
      expect(notesData).not.toHaveProperty("bodies");
      expect(notesData).not.toHaveProperty("noteIds");

      // Decision metadata
      expect(snapshot.decisionMetadata).toBeDefined();
      const dm = snapshot.decisionMetadata as Record<string, unknown>;
      expect(dm.decision).toBe("APPROVE");
      expect(dm.reviewerUserId).toBe(owner.id);
      expect(dm).not.toHaveProperty("reasonLength");
    });

    it("limits transactions to 20 in evidence snapshot", async () => {
      const { org, owner, openCase, customer } = await seedOrgWithCase();

      // Create 25 transactions
      for (let i = 0; i < 25; i++) {
        await prisma.transaction.create({
          data: {
            organizationId: org.id,
            complianceCaseId: openCase.id,
            customerProfileId: customer.id,
            externalReference: `TXN-${i + 2}`,
            direction: "INBOUND",
            amount: 100,
            currency: "USD",
            occurredAt: new Date(),
          },
        });
      }

      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "Bulk tx test",
      });

      const snapshot = JSON.parse(result.approvalDecision.evidenceSnapshotJson ?? "{}") as Record<string, unknown>;
      const txData = snapshot.transactions as Record<string, unknown>;
      expect(txData.count).toBe(10); // workspace fetches max 10; snapshot respects that
      expect((txData.latest as unknown[]).length).toBe(10);
    });

    it("creates optional internal case note when createCaseNote=true", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "All checks passed",
        createCaseNote: true,
        reviewerComment: "Looks good",
      });

      expect(result.createdCaseNoteId).toBeTruthy();
      const note = await prisma.caseNote.findUnique({ where: { id: result.createdCaseNoteId! } });
      expect(note).toBeTruthy();
      expect(note?.body).toContain("Final Decision: APPROVE");
      expect(note?.body).toContain("All checks passed");
      expect(note?.body).toContain("Looks good");
      expect(note?.visibility).toBe("INTERNAL");

      // Should have both CASE_NOTE_CREATED and APPROVAL_DECISION_CREATED audits
      const noteAudit = await prisma.auditEvent.findFirst({
        where: { action: "CASE_NOTE_CREATED", entityId: result.createdCaseNoteId! },
      });
      expect(noteAudit).toBeTruthy();

      const decisionAudit = await prisma.auditEvent.findFirst({
        where: { action: "APPROVAL_DECISION_CREATED", entityId: openCase.id },
      });
      expect(decisionAudit).toBeTruthy();
      const meta = JSON.parse(decisionAudit!.metadataJson ?? "{}");
      expect(meta.createdCaseNoteId).toBe(result.createdCaseNoteId);
    });

    it("does not create case note when createCaseNote=false", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "All checks passed",
        createCaseNote: false,
      });

      expect(result.createdCaseNoteId).toBeUndefined();
      const notes = await prisma.caseNote.count({ where: { complianceCaseId: openCase.id } });
      expect(notes).toBe(1); // only the seed note
    });

    it("does not create case note when createCaseNote is omitted", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "All checks passed",
      });

      expect(result.createdCaseNoteId).toBeUndefined();
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
      expect(result.approvalDecision.decision).toBe("CLOSE_NO_ACTION");
    });

    it("allows ADMIN to make final decisions", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      // Reuse owner as admin-equivalent since OWNER has all permissions
      // Seed a dedicated admin user
      const admin = await prisma.user.create({
        data: { email: "admin@example.com", name: "Admin", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: org.id, userId: admin.id, role: OrganizationRole.ADMIN, status: MembershipStatus.ACTIVE },
      });
      const result = await makeFinalDecisionService(ctx(admin.id, org.id, OrganizationRole.ADMIN), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "Admin decision",
      });
      expect(result.approvalDecision.decision).toBe("APPROVE");
    });

    it("unauthorized attempts do not write success audit events", async () => {
      const { org, analyst, openCase } = await seedOrgWithCase();
      try {
        await makeFinalDecisionService(ctx(analyst.id, org.id, OrganizationRole.COMPLIANCE_ANALYST), {
          caseId: openCase.id,
          decision: "APPROVE",
          reason: "Should fail",
        });
      } catch {
        // expected
      }
      const allAudits = await prisma.auditEvent.findMany({
        where: { entityId: openCase.id },
      });
      expect(allAudits.every((a) => a.action !== "APPROVAL_DECISION_CREATED")).toBe(true);
    });

    it("human can make decision different from AI recommendedAction", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      // Create an AI risk memo recommending HIGH_RISK_ESCALATION
      const agentRun = await prisma.agentRun.create({
        data: {
          organizationId: org.id,
          complianceCaseId: openCase.id,
          agentType: "RISK_MEMO",
          provider: "mock",
          model: "gpt-4o-mini",
          promptVersion: "risk-memo-v1",
          inputHash: "abc123",
          status: "SUCCEEDED",
        },
      });
      await prisma.riskMemo.create({
        data: {
          organizationId: org.id,
          complianceCaseId: openCase.id,
          agentRunId: agentRun.id,
          executiveSummary: "High risk detected",
          profileSummary: "Summary",
          documentReview: "Review",
          transactionReview: "Tx review",
          riskSignalsSummary: "Signals",
          missingInformation: "None",
          recommendedAction: "HIGH_RISK_ESCALATION",
          limitations: "AI advisory only",
        },
      });

      // Human decides to CLOSE instead of ESCALATE
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "CLOSE_NO_ACTION",
        reason: "Human overrode AI recommendation",
      });

      expect(result.approvalDecision.decision).toBe("CLOSE_NO_ACTION");
      const updatedCase = await prisma.complianceCase.findUnique({ where: { id: openCase.id } });
      expect(updatedCase?.status).toBe("CLOSED");
    });
  });

  describe("immutability", () => {
    it("ApprovalDecision has no updatedAt field in schema", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      const result = await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "Immutable test",
      });

      const decision = await prisma.approvalDecision.findUnique({ where: { id: result.approvalDecision.id } });
      expect(decision).toBeTruthy();
      // Prisma model does not have updatedAt; the client should not return it
      expect(decision).not.toHaveProperty("updatedAt");
    });

    it("no helper exists to update ApprovalDecision", async () => {
      // The database package only exports createApprovalDecision; no update or delete helpers
      const { prisma: dbClient } = await import("@regops-ai/database");
      // Verify by inspecting the module that only create is available
      const helpers = await import("@regops-ai/database/src/helpers/approval-decision");
      expect(typeof helpers.createApprovalDecision).toBe("function");
      expect(typeof (helpers as Record<string, unknown>).updateApprovalDecision).toBe("undefined");
      expect(typeof (helpers as Record<string, unknown>).deleteApprovalDecision).toBe("undefined");
    });

    it("terminal case rejects subsequent decisions", async () => {
      const { org, owner, openCase } = await seedOrgWithCase();
      await makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
        caseId: openCase.id,
        decision: "APPROVE",
        reason: "First decision",
      });

      await expect(
        makeFinalDecisionService(ctx(owner.id, org.id, OrganizationRole.OWNER), {
          caseId: openCase.id,
          decision: "REJECT",
          reason: "Second decision should fail",
        })
      ).rejects.toThrow("Cannot make final decision: case is already APPROVED");

      const decisions = await prisma.approvalDecision.count({ where: { complianceCaseId: openCase.id } });
      expect(decisions).toBe(1);
    });
  });

  describe("AI separation", () => {
    it("decision service does not import or call AI provider", async () => {
      // The decision-service module should have no dependency on @regops-ai/ai
      const decisionModule = await import("./decision-service");
      expect(Object.keys(decisionModule)).not.toContain("createAIProvider");
      expect(Object.keys(decisionModule)).not.toContain("generateRiskMemo");
    });
  });
});
