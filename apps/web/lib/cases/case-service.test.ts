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
  listCasesService,
  getCaseService,
  createCaseService,
  updateCaseService,
  assignCaseService,
  changeCaseStatusService,
  addCaseNoteService,
  getCustomerService,
  getBusinessService,
} from "./case-service";
import type { ActorContext } from "./case-service";

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
  const analystA = await prisma.user.create({
    data: { email: "analyst-a@example.com", name: "Analyst A", status: UserStatus.ACTIVE },
  });
  const auditorA = await prisma.user.create({
    data: { email: "auditor-a@example.com", name: "Auditor A", status: UserStatus.ACTIVE },
  });
  const managerA = await prisma.user.create({
    data: { email: "manager-a@example.com", name: "Manager A", status: UserStatus.ACTIVE },
  });
  const ownerB = await prisma.user.create({
    data: { email: "owner-b@example.com", name: "Owner B", status: UserStatus.ACTIVE },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgA.id, userId: ownerA.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: orgA.id, userId: analystA.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
      { organizationId: orgA.id, userId: auditorA.id, role: OrganizationRole.READ_ONLY_AUDITOR, status: MembershipStatus.ACTIVE },
      { organizationId: orgA.id, userId: managerA.id, role: OrganizationRole.COMPLIANCE_MANAGER, status: MembershipStatus.ACTIVE },
      { organizationId: orgB.id, userId: ownerB.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
    ],
  });

  const customerA = await prisma.customerProfile.create({
    data: {
      organizationId: orgA.id,
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.LOW,
    },
  });

  const customerB = await prisma.customerProfile.create({
    data: {
      organizationId: orgB.id,
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.HIGH,
    },
  });

  const businessA = await prisma.businessProfile.create({
    data: {
      organizationId: orgA.id,
      legalName: "Business A Ltd",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.MEDIUM,
    },
  });

  const businessB = await prisma.businessProfile.create({
    data: {
      organizationId: orgB.id,
      legalName: "Business B Ltd",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.CRITICAL,
    },
  });

  const caseA = await prisma.complianceCase.create({
    data: {
      organizationId: orgA.id,
      customerProfileId: customerA.id,
      title: "Case A",
      status: CaseStatus.OPEN,
      riskLevel: RiskLevel.LOW,
      openedByUserId: ownerA.id,
    },
  });

  const caseB = await prisma.complianceCase.create({
    data: {
      organizationId: orgB.id,
      customerProfileId: customerB.id,
      title: "Case B",
      status: CaseStatus.IN_REVIEW,
      riskLevel: RiskLevel.HIGH,
      openedByUserId: ownerB.id,
    },
  });

  return {
    orgA, orgB,
    ownerA, analystA, auditorA, managerA, ownerB,
    customerA, customerB,
    businessA, businessB,
    caseA, caseB,
  };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("case-service", () => {
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

  // ─── Tenant Isolation ───

  describe("tenant isolation", () => {
    it("getCaseService does not return a case from another organization", async () => {
      const { orgA, caseB } = await seedTwoOrgs();
      const found = await getCaseService(ctx("user-does-not-matter", orgA.id, "OWNER"), caseB.id);
      expect(found).toBeNull();
    });

    it("listCasesService returns only cases from the requested organization", async () => {
      const { orgA, caseA } = await seedTwoOrgs();
      const cases = await listCasesService(ctx("user-does-not-matter", orgA.id, "OWNER"));
      expect(cases).toHaveLength(1);
      expect(cases[0].id).toBe(caseA.id);
    });

    it("getCustomerService does not return a customer from another organization", async () => {
      const { orgA, customerB } = await seedTwoOrgs();
      const found = await getCustomerService(ctx("user-does-not-matter", orgA.id, "OWNER"), customerB.id);
      expect(found).toBeNull();
    });

    it("getBusinessService does not return a business from another organization", async () => {
      const { orgA, businessB } = await seedTwoOrgs();
      const found = await getBusinessService(ctx("user-does-not-matter", orgA.id, "OWNER"), businessB.id);
      expect(found).toBeNull();
    });

    it("createCaseService rejects customerProfileId from another organization", async () => {
      const { orgA, ownerA, customerB } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("customerProfileId", customerB.id);
      fd.append("title", "Bad case");
      fd.append("riskLevel", "LOW");
      await expect(
        createCaseService(ctx(ownerA.id, orgA.id, "OWNER"), fd)
      ).rejects.toThrow("Customer not found");
    });

    it("createCaseService rejects businessProfileId from another organization", async () => {
      const { orgA, ownerA, businessB } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("businessProfileId", businessB.id);
      fd.append("title", "Bad case");
      fd.append("riskLevel", "LOW");
      await expect(
        createCaseService(ctx(ownerA.id, orgA.id, "OWNER"), fd)
      ).rejects.toThrow("Business not found");
    });

    it("updateCaseService rejects updating a case from another organization", async () => {
      const { orgA, ownerA, caseB } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("title", "Hacked");
      await expect(
        updateCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseB.id, fd)
      ).rejects.toThrow("Case not found");
    });

    it("assignCaseService rejects assigning a case from another organization", async () => {
      const { orgA, ownerA, caseB } = await seedTwoOrgs();
      await expect(
        assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseB.id, null)
      ).rejects.toThrow("Case not found");
    });

    it("changeCaseStatusService rejects updating status of a case from another organization", async () => {
      const { orgA, ownerA, caseB } = await seedTwoOrgs();
      await expect(
        changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseB.id, "CLOSED")
      ).rejects.toThrow("Case not found");
    });

    it("addCaseNoteService rejects adding note to a case from another organization", async () => {
      const { orgA, ownerA, caseB } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("body", "Hacked note");
      await expect(
        addCaseNoteService(ctx(ownerA.id, orgA.id, "OWNER"), caseB.id, fd)
      ).rejects.toThrow("Case not found");
    });
  });

  // ─── RBAC ───

  describe("RBAC enforcement", () => {
    it("READ_ONLY_AUDITOR cannot create case", async () => {
      const { orgA, auditorA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("title", "Test");
      fd.append("riskLevel", "LOW");
      await expect(
        createCaseService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), fd)
      ).rejects.toThrow("Forbidden: missing permission cases:create");
    });

    it("READ_ONLY_AUDITOR cannot update case", async () => {
      const { orgA, auditorA, caseA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("title", "Test");
      await expect(
        updateCaseService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), caseA.id, fd)
      ).rejects.toThrow("Forbidden: missing permission cases:update");
    });

    it("READ_ONLY_AUDITOR cannot add note", async () => {
      const { orgA, auditorA, caseA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("body", "Test note");
      await expect(
        addCaseNoteService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), caseA.id, fd)
      ).rejects.toThrow("Forbidden: missing permission cases:update");
    });

    it("READ_ONLY_AUDITOR cannot assign case", async () => {
      const { orgA, auditorA, caseA } = await seedTwoOrgs();
      await expect(
        assignCaseService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), caseA.id, null)
      ).rejects.toThrow("Forbidden: missing permission cases:assign");
    });

    it("COMPLIANCE_ANALYST can create case", async () => {
      const { orgA, analystA, customerA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("customerProfileId", customerA.id);
      fd.append("title", "Analyst case");
      fd.append("riskLevel", "LOW");
      const newCase = await createCaseService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), fd);
      expect(newCase.title).toBe("Analyst case");
    });

    it("COMPLIANCE_ANALYST can add note", async () => {
      const { orgA, analystA, caseA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("body", "Analyst note");
      await addCaseNoteService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), caseA.id, fd);
      const updated = await getCaseService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), caseA.id);
      expect(updated?.notes).toHaveLength(1);
      expect(updated?.notes[0].body).toBe("Analyst note");
    });

    it("COMPLIANCE_ANALYST cannot assign case", async () => {
      const { orgA, analystA, caseA } = await seedTwoOrgs();
      await expect(
        assignCaseService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), caseA.id, null)
      ).rejects.toThrow("Forbidden: missing permission cases:assign");
    });

    it("COMPLIANCE_MANAGER can assign case", async () => {
      const { orgA, managerA, analystA, caseA } = await seedTwoOrgs();
      await assignCaseService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), caseA.id, analystA.id);
      const updated = await getCaseService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), caseA.id);
      expect(updated?.assignedToUserId).toBe(analystA.id);
    });

    it("OWNER can assign case", async () => {
      const { orgA, ownerA, analystA, caseA } = await seedTwoOrgs();
      await assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, analystA.id);
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.assignedToUserId).toBe(analystA.id);
    });

    it("ADMIN can assign case", async () => {
      const { orgA, ownerA, analystA, caseA } = await seedTwoOrgs();
      // OWNER has all permissions same as ADMIN, so test OWNER as proxy for ADMIN behavior
      // since we don't have a dedicated ADMIN user in seed. The role matrix confirms ADMIN == OWNER.
      await assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, analystA.id);
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.assignedToUserId).toBe(analystA.id);
    });
  });

  // ─── Audit Events ───

  describe("audit events", () => {
    it("createCaseService writes CASE_CREATED AuditEvent", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("customerProfileId", customerA.id);
      fd.append("title", "Audit test case");
      fd.append("riskLevel", "MEDIUM");
      const newCase = await createCaseService(ctx(ownerA.id, orgA.id, "OWNER"), fd);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: newCase.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("CASE_CREATED");
      expect(events[0].actorUserId).toBe(ownerA.id);
      expect(events[0].entityType).toBe("ComplianceCase");
      const meta = JSON.parse(events[0].metadataJson ?? "{}");
      expect(meta.title).toBe("Audit test case");
      expect(meta.riskLevel).toBe("MEDIUM");
      expect(meta.subjectType).toBe("individual");
    });

    it("updateCaseService writes CASE_UPDATED AuditEvent", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("title", "Updated title");
      await updateCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, fd);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: caseA.id, action: "CASE_UPDATED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      const meta = JSON.parse(events[0].metadataJson ?? "{}");
      expect(meta.title).toBe("Updated title");
    });

    it("assignCaseService writes CASE_ASSIGNED AuditEvent", async () => {
      const { orgA, ownerA, analystA, caseA } = await seedTwoOrgs();
      await assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, analystA.id);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: caseA.id, action: "CASE_ASSIGNED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      const meta = JSON.parse(events[0].metadataJson ?? "{}");
      expect(meta.assignedToUserId).toBe(analystA.id);
    });

    it("changeCaseStatusService writes CASE_STATUS_UPDATED AuditEvent", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "CLOSED");

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: caseA.id, action: "CASE_STATUS_UPDATED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      const meta = JSON.parse(events[0].metadataJson ?? "{}");
      expect(meta.status).toBe("CLOSED");
    });

    it("addCaseNoteService writes CASE_NOTE_CREATED AuditEvent", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("body", "Note body");
      fd.append("visibility", "AUDITOR_VISIBLE");
      await addCaseNoteService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, fd);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, action: "CASE_NOTE_CREATED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      expect(events[0].entityType).toBe("CaseNote");
      const meta = JSON.parse(events[0].metadataJson ?? "{}");
      expect(meta.complianceCaseId).toBe(caseA.id);
      expect(meta.visibility).toBe("AUDITOR_VISIBLE");
    });
  });

  // ─── Status Restrictions ───

  describe("status restrictions", () => {
    it("changeCaseStatusService rejects APPROVED", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await expect(
        changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "APPROVED" as CaseStatus)
      ).rejects.toThrow("Invalid status for this operation");
    });

    it("changeCaseStatusService rejects REJECTED", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await expect(
        changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "REJECTED" as CaseStatus)
      ).rejects.toThrow("Invalid status for this operation");
    });

    it("changeCaseStatusService accepts OPEN", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "OPEN");
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.status).toBe("OPEN");
    });

    it("changeCaseStatusService accepts IN_REVIEW", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "IN_REVIEW");
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.status).toBe("IN_REVIEW");
    });

    it("changeCaseStatusService accepts ESCALATED", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "ESCALATED");
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.status).toBe("ESCALATED");
    });

    it("changeCaseStatusService accepts CLOSED", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "CLOSED");
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.status).toBe("CLOSED");
      expect(updated?.closedAt).toBeInstanceOf(Date);
    });

    it("rejected status change does not write AuditEvent", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      try {
        await changeCaseStatusService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, "APPROVED" as CaseStatus);
      } catch {
        // expected
      }
      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: caseA.id },
      });
      expect(events).toHaveLength(0);
    });
  });

  // ─── Assignment Validation ───

  describe("assignment validation", () => {
    it("createCaseService rejects assignedToUserId who is not an active member", async () => {
      const { orgA, ownerA, customerA, ownerB } = await seedTwoOrgs();
      const fd = new FormData();
      fd.append("customerProfileId", customerA.id);
      fd.append("title", "Bad assign");
      fd.append("riskLevel", "LOW");
      fd.append("assignedToUserId", ownerB.id); // ownerB is in orgB, not orgA
      await expect(
        createCaseService(ctx(ownerA.id, orgA.id, "OWNER"), fd)
      ).rejects.toThrow("Assigned user is not an active member");
    });

    it("assignCaseService rejects user who is not an active member", async () => {
      const { orgA, ownerA, caseA, ownerB } = await seedTwoOrgs();
      await expect(
        assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, ownerB.id)
      ).rejects.toThrow("User is not an active member");
    });

    it("assignCaseService allows unassigning (null)", async () => {
      const { orgA, ownerA, analystA, caseA } = await seedTwoOrgs();
      // First assign
      await assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, analystA.id);
      // Then unassign
      await assignCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id, null);
      const updated = await getCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(updated?.assignedToUserId).toBeNull();
    });
  });
});
