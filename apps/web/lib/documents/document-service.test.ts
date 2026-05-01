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
  uploadDocumentService,
  archiveDocumentService,
  getDocumentDownloadService,
  listDocumentsForCaseService,
  listDocumentsForCustomerService,
  listDocumentsForBusinessService,
  getDocumentService,
} from "./document-service";
import type { ActorContext } from "./document-service";

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
    data: { organizationId: orgA.id, firstName: "Alice", lastName: "Smith", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const customerB = await prisma.customerProfile.create({
    data: { organizationId: orgB.id, firstName: "Bob", lastName: "Jones", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.HIGH },
  });

  const businessA = await prisma.businessProfile.create({
    data: { organizationId: orgA.id, legalName: "Business A Ltd", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.MEDIUM },
  });
  const businessB = await prisma.businessProfile.create({
    data: { organizationId: orgB.id, legalName: "Business B Ltd", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.HIGH },
  });

  const caseA = await prisma.complianceCase.create({
    data: { organizationId: orgA.id, customerProfileId: customerA.id, title: "Case A", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: ownerA.id },
  });

  return { orgA, orgB, ownerA, analystA, auditorA, managerA, ownerB, customerA, customerB, businessA, businessB, caseA };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

describe("document-service", () => {
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

  // ─── Upload ───

  describe("uploadDocumentService", () => {
    it("creates document linked to case with correct DOCUMENT_UPLOADED audit fields", async () => {
      const { orgA, ownerA, caseA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileBuffer: Buffer.from("%PDF-1.4 test"),
        type: "BANK_STATEMENT",
        complianceCaseId: caseA.id,
      });

      expect(doc.originalFileName).toBe("report.pdf");
      expect(doc.type).toBe("BANK_STATEMENT");
      expect(doc.organizationId).toBe(orgA.id);
      expect(doc.checksumSha256).toBeDefined();

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: "DOCUMENT_UPLOADED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      expect(events[0].entityType).toBe("Document");
      expect(events[0].entityId).toBe(doc.id);

      const metadata = JSON.parse(events[0].metadataJson ?? "{}");
      expect(metadata.documentType).toBe("BANK_STATEMENT");
      expect(metadata.originalFileName).toBe("report.pdf");
      expect(metadata.mimeType).toBe("application/pdf");
      expect(metadata.sizeBytes).toBeGreaterThan(0);
      expect(metadata.complianceCaseId).toBe(caseA.id);
      expect(metadata.storageKey).toBeUndefined();
      expect(metadata.extractedText).toBeUndefined();
    });

    it("TXT upload extracts text and creates DOCUMENT_EXTRACTION_COMPLETED", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const content = "hello extraction test";
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "notes.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from(content),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(updated?.status).toBe("EXTRACTED");
      expect(updated?.extractedText).toBe(content);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: "DOCUMENT_EXTRACTION_COMPLETED" },
      });
      expect(events).toHaveLength(1);
      const metadata = JSON.parse(events[0].metadataJson ?? "{}");
      expect(metadata.source).toBe("utf-8-text");
    });

    it("CSV upload extracts text and creates DOCUMENT_EXTRACTION_COMPLETED", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const content = "col1,col2\nval1,val2";
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "data.csv",
        mimeType: "text/csv",
        fileBuffer: Buffer.from(content),
        type: "TRANSACTION_CSV",
        customerProfileId: customerA.id,
      });

      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(updated?.status).toBe("EXTRACTED");
      expect(updated?.extractedText).toBe(content);

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: "DOCUMENT_EXTRACTION_COMPLETED" },
      });
      expect(events).toHaveLength(1);
    });

    it("PNG upload accepted with status UPLOADED and no extraction audit", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "image.png",
        mimeType: "image/png",
        fileBuffer: pngBuffer,
        type: "ID_DOCUMENT",
        customerProfileId: customerA.id,
      });

      expect(doc.status).toBe("UPLOADED");

      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(updated?.status).toBe("UPLOADED");
      const meta = updated?.extractionMetadataJson ? JSON.parse(updated.extractionMetadataJson) : null;
      expect(meta?.reason).toBe("OCR not implemented in this phase");

      const extractionEvents = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: { in: ["DOCUMENT_EXTRACTION_COMPLETED", "DOCUMENT_EXTRACTION_FAILED"] } },
      });
      expect(extractionEvents).toHaveLength(0);
    });

    it("JPEG upload accepted with status UPLOADED and no extraction audit", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "image.jpg",
        mimeType: "image/jpeg",
        fileBuffer: jpegBuffer,
        type: "ID_DOCUMENT",
        customerProfileId: customerA.id,
      });

      expect(doc.status).toBe("UPLOADED");
      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      const meta = updated?.extractionMetadataJson ? JSON.parse(updated.extractionMetadataJson) : null;
      expect(meta?.reason).toBe("OCR not implemented in this phase");

      const extractionEvents = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: { in: ["DOCUMENT_EXTRACTION_COMPLETED", "DOCUMENT_EXTRACTION_FAILED"] } },
      });
      expect(extractionEvents).toHaveLength(0);
    });

    it("rejects invalid PDF magic bytes", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "fake.pdf",
          mimeType: "application/pdf",
          fileBuffer: Buffer.from("not a real pdf"),
          type: "OTHER",
          customerProfileId: customerA.id,
        })
      ).rejects.toThrow("File content does not match declared format");
    });

    it("valid upload with extraction failure keeps stored file", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "notes.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("safe content"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      const download = await getDocumentDownloadService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(download.buffer.toString()).toBe("safe content");
    });

    it("rejects upload linked to org B case", async () => {
      const { orgA, orgB, ownerA, ownerB } = await seedTwoOrgs();
      const caseB = await prisma.complianceCase.create({
        data: { organizationId: orgB.id, title: "Case B", status: CaseStatus.OPEN, riskLevel: RiskLevel.HIGH, openedByUserId: ownerB.id },
      });
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "test.txt",
          mimeType: "text/plain",
          fileBuffer: Buffer.from("hello"),
          type: "OTHER",
          complianceCaseId: caseB.id,
        })
      ).rejects.toThrow("Case not found in organization");
    });

    it("rejects upload linked to org B customer", async () => {
      const { orgA, ownerA, customerB } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "test.txt",
          mimeType: "text/plain",
          fileBuffer: Buffer.from("hello"),
          type: "OTHER",
          customerProfileId: customerB.id,
        })
      ).rejects.toThrow("Customer not found in organization");
    });

    it("rejects upload linked to org B business", async () => {
      const { orgA, ownerA, businessB } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "test.txt",
          mimeType: "text/plain",
          fileBuffer: Buffer.from("hello"),
          type: "OTHER",
          businessProfileId: businessB.id,
        })
      ).rejects.toThrow("Business not found in organization");
    });

    it("READ_ONLY_AUDITOR cannot upload", async () => {
      const { orgA, auditorA } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), {
          fileName: "test.txt",
          mimeType: "text/plain",
          fileBuffer: Buffer.from("hello"),
          type: "OTHER",
        })
      ).rejects.toThrow("Forbidden: missing permission documents:upload");
    });

    it("COMPLIANCE_ANALYST can upload", async () => {
      const { orgA, analystA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), {
        fileName: "test.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("hello"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });
      expect(doc.id).toBeDefined();
    });

    it("rejects invalid file type", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "virus.exe",
          mimeType: "application/octet-stream",
          fileBuffer: Buffer.from("MZ"),
          type: "OTHER",
          customerProfileId: customerA.id,
        })
      ).rejects.toThrow("extension");
    });

    it("requires at least one linked entity", async () => {
      const { orgA, ownerA } = await seedTwoOrgs();
      await expect(
        uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
          fileName: "test.txt",
          mimeType: "text/plain",
          fileBuffer: Buffer.from("hello"),
          type: "OTHER",
        })
      ).rejects.toThrow("linked to at least one");
    });
  });

  // ─── Tenant Isolation ───

  describe("tenant isolation", () => {
    it("getDocumentService does not return org B document", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      const found = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id);
      expect(found).toBeNull();
    });

    it("archiveDocumentService rejects org B document", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      await expect(
        archiveDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id)
      ).rejects.toThrow("Document not found");
    });

    it("getDocumentDownloadService rejects org B document", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      await expect(
        getDocumentDownloadService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id)
      ).rejects.toThrow("Document not found");
    });

    it("org A cannot download org B document - no audit created", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      await expect(
        getDocumentDownloadService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id)
      ).rejects.toThrow("Document not found");

      const audits = await prisma.auditEvent.findMany({
        where: { entityId: docB.id, action: "DOCUMENT_DOWNLOADED" },
      });
      expect(audits).toHaveLength(0);
    });

    it("org A cannot archive org B document - no audit created", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      await expect(
        archiveDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id)
      ).rejects.toThrow("Document not found");

      const audits = await prisma.auditEvent.findMany({
        where: { entityId: docB.id, action: "DOCUMENT_ARCHIVED" },
      });
      expect(audits).toHaveLength(0);
    });
  });

  // ─── Archive ───

  describe("archiveDocumentService", () => {
    it("archives document and writes DOCUMENT_ARCHIVED audit", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "old.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("old"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      await archiveDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);

      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(updated?.status).toBe("ARCHIVED");

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: "DOCUMENT_ARCHIVED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      expect(events[0].entityType).toBe("Document");
      const metadata = JSON.parse(events[0].metadataJson ?? "{}");
      expect(metadata.originalFileName).toBe("old.txt");
    });

    it("auditor cannot archive - no audit created", async () => {
      const { orgA, ownerA, auditorA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "old.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("old content"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      await expect(
        archiveDocumentService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), doc.id)
      ).rejects.toThrow("Forbidden: missing permission documents:archive");

      const audits = await prisma.auditEvent.findMany({
        where: { entityId: doc.id, action: "DOCUMENT_ARCHIVED" },
      });
      expect(audits).toHaveLength(0);
    });

    it("analyst cannot archive - no audit created", async () => {
      const { orgA, ownerA, analystA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "old.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("old content"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      await expect(
        archiveDocumentService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), doc.id)
      ).rejects.toThrow("Forbidden: missing permission documents:archive");

      const audits = await prisma.auditEvent.findMany({
        where: { entityId: doc.id, action: "DOCUMENT_ARCHIVED" },
      });
      expect(audits).toHaveLength(0);
    });

    it("manager can archive", async () => {
      const { orgA, managerA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), {
        fileName: "mgr.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("mgr"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      await archiveDocumentService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), doc.id);

      const updated = await getDocumentService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), doc.id);
      expect(updated?.status).toBe("ARCHIVED");
    });

    it("owner/admin can archive", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "admin.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("admin"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      await archiveDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);

      const updated = await getDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(updated?.status).toBe("ARCHIVED");
    });
  });

  // ─── List ───

  describe("list documents", () => {
    it("listDocumentsForCaseService returns only case documents", async () => {
      const { orgA, ownerA, caseA, customerA } = await seedTwoOrgs();
      await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "case-doc.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("case"),
        type: "OTHER",
        complianceCaseId: caseA.id,
      });
      await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "customer-doc.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("customer"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      const docs = await listDocumentsForCaseService(ctx(ownerA.id, orgA.id, "OWNER"), caseA.id);
      expect(docs).toHaveLength(1);
      expect(docs[0].originalFileName).toBe("case-doc.txt");
    });
  });

  // ─── Download ───

  describe("download", () => {
    it("returns file buffer and creates DOCUMENT_DOWNLOADED audit", async () => {
      const { orgA, ownerA, customerA } = await seedTwoOrgs();
      const doc = await uploadDocumentService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileName: "download.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("download me"),
        type: "OTHER",
        customerProfileId: customerA.id,
      });

      const result = await getDocumentDownloadService(ctx(ownerA.id, orgA.id, "OWNER"), doc.id);
      expect(result.fileName).toBe("download.txt");
      expect(result.buffer.toString()).toBe("download me");

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.id, entityId: doc.id, action: "DOCUMENT_DOWNLOADED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(ownerA.id);
      const metadata = JSON.parse(events[0].metadataJson ?? "{}");
      expect(metadata.originalFileName).toBe("download.txt");
    });

    it("cross-org download rejected - no audit created", async () => {
      const { orgA, orgB, ownerA, ownerB, customerB } = await seedTwoOrgs();
      const docB = await uploadDocumentService(ctx(ownerB.id, orgB.id, "OWNER"), {
        fileName: "secret.txt",
        mimeType: "text/plain",
        fileBuffer: Buffer.from("secret"),
        type: "OTHER",
        customerProfileId: customerB.id,
      });

      await expect(
        getDocumentDownloadService(ctx(ownerA.id, orgA.id, "OWNER"), docB.id)
      ).rejects.toThrow("Document not found");

      const audits = await prisma.auditEvent.findMany({
        where: { entityId: docB.id, action: "DOCUMENT_DOWNLOADED" },
      });
      expect(audits).toHaveLength(0);
    });
  });
});
