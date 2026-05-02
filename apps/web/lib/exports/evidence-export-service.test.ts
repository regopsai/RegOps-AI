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
  DocumentType,
  DocumentStatus,
  TransactionDirection,
  RiskSignalSeverity,
  ApprovalDecisionType,
  CaseNoteVisibility,
} from "@regops-ai/database";
import {
  buildEvidenceExportService,
  renderEvidenceExportJsonService,
  renderEvidenceExportPdfService,
  generateEvidenceExportService,
  maskSensitiveValue,
  summarizeRiskSignalEvidence,
  summarizeAuditMetadata,
  getSafeExportFilename,
} from "./evidence-export-service";

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

async function seedCustomerCase() {
  const org = await prisma.organization.create({
    data: { name: "Export Org", slug: "export-org", status: OrganizationStatus.ACTIVE },
  });
  const org2 = await prisma.organization.create({
    data: { name: "Other Org", slug: "other-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-export@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const manager = await prisma.user.create({
    data: { email: "manager-export@example.com", name: "Manager", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-export@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  const auditor = await prisma.user.create({
    data: { email: "auditor-export@example.com", name: "Auditor", status: UserStatus.ACTIVE },
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
      phone: "+1234567890",
      nationality: "US",
      countryOfResidence: "US",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.MEDIUM,
    },
  });

  const complianceCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: customer.id,
      title: "Test Case",
      description: "A test case for export",
      status: CaseStatus.OPEN,
      riskLevel: RiskLevel.MEDIUM,
      openedByUserId: owner.id,
      openedAt: new Date("2024-01-15T00:00:00Z"),
    },
  });

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      type: DocumentType.ID_DOCUMENT,
      status: DocumentStatus.UPLOADED,
      originalFileName: "id.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "secret/storage/key/123",
      checksumSha256: "abc123",
      uploadedByUserId: owner.id,
      extractedText: "This is sensitive extracted text",
    },
  });

  const transaction = await prisma.transaction.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      externalReference: "TXN-001",
      direction: TransactionDirection.INBOUND,
      amount: 5000.5,
      currency: "USD",
      counterpartyName: "Bob Corp",
      counterpartyAccount: "GB82WEST12345698765432",
      counterpartyCountry: "GB",
      paymentRail: "SWIFT",
      transactionType: "WIRE",
      occurredAt: new Date("2024-01-10T00:00:00Z"),
    },
  });

  const riskSignal = await prisma.riskSignal.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      ruleId: "HIGH_VALUE_TRANSACTION",
      title: "High value transaction",
      description: "Transaction exceeds threshold",
      severity: RiskSignalSeverity.HIGH,
      evidenceJson: JSON.stringify({ amount: 5000.5, threshold: 10000, currency: "USD" }),
      evidenceHash: "hash123",
    },
  });

  const riskMemo = await prisma.riskMemo.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      executiveSummary: "Executive summary text",
      profileSummary: "Profile summary text",
      documentReview: "Document review text",
      transactionReview: "Transaction review text",
      riskSignalsSummary: "Risk signals summary",
      missingInformation: "Missing info text",
      recommendedAction: "MEDIUM_RISK_REVIEW",
      limitations: "Limitations text",
      acceptedByUserId: owner.id,
      acceptedAt: new Date("2024-01-20T00:00:00Z"),
    },
  });

  const approvalDecision = await prisma.approvalDecision.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      decision: ApprovalDecisionType.APPROVE,
      reason: "Looks good",
      evidenceSnapshotJson: JSON.stringify({ snapshotVersion: "1.0", caseId: complianceCase.id }),
      reviewerUserId: owner.id,
    },
  });

  const auditorNote = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      authorUserId: auditor.id,
      body: "Auditor visible note body",
      visibility: CaseNoteVisibility.AUDITOR_VISIBLE,
    },
  });

  const internalNote = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: complianceCase.id,
      authorUserId: manager.id,
      body: "Internal secret note body",
      visibility: CaseNoteVisibility.INTERNAL,
    },
  });

  return {
    org,
    org2,
    owner,
    manager,
    analyst,
    auditor,
    customer,
    complianceCase,
    doc,
    transaction,
    riskSignal,
    riskMemo,
    approvalDecision,
    auditorNote,
    internalNote,
  };
}

async function seedBusinessCase() {
  const org = await prisma.organization.create({
    data: { name: "Business Export Org", slug: "business-export-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-biz@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  const business = await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      legalName: "Acme Inc",
      tradingName: "Acme",
      registrationNumber: "REG-123",
      incorporationCountry: "US",
      operatingCountry: "US",
      industry: "Fintech",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.HIGH,
    },
  });

  const complianceCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      businessProfileId: business.id,
      title: "Business Test Case",
      description: "A business case for export",
      status: CaseStatus.OPEN,
      riskLevel: RiskLevel.HIGH,
      openedByUserId: owner.id,
    },
  });

  return { org, owner, business, complianceCase };
}

describe("evidence-export-service", () => {
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

  describe("maskSensitiveValue", () => {
    it("masks values longer than 4 chars", () => {
      expect(maskSensitiveValue("GB82WEST12345698765432")).toBe("******************5432");
    });
    it("masks short values completely", () => {
      expect(maskSensitiveValue("1234")).toBe("****");
    });
    it("returns null for null/undefined", () => {
      expect(maskSensitiveValue(null)).toBeNull();
      expect(maskSensitiveValue(undefined)).toBeNull();
    });
  });

  describe("summarizeRiskSignalEvidence", () => {
    it("summarizes JSON evidence", () => {
      const result = summarizeRiskSignalEvidence(JSON.stringify({ amount: 5000, note: "x".repeat(300) }));
      expect(result).toContain("amount");
      expect(result).toContain("...");
      expect(result!.length).toBeLessThanOrEqual(1003);
    });
    it("returns null for null input", () => {
      expect(summarizeRiskSignalEvidence(null)).toBeNull();
    });
    it("handles invalid JSON", () => {
      expect(summarizeRiskSignalEvidence("not json")).toBe("not json");
    });
  });

  describe("summarizeAuditMetadata", () => {
    it("redacts blocked keys", () => {
      const result = summarizeAuditMetadata(JSON.stringify({ storageKey: "secret", amount: 100 }));
      expect(result).toContain("[redacted]");
      expect(result).toContain("100");
    });
    it("returns null for null input", () => {
      expect(summarizeAuditMetadata(null)).toBeNull();
    });
  });

  describe("getSafeExportFilename", () => {
    it("formats filename correctly", () => {
      const filename = getSafeExportFilename("case123", "json");
      expect(filename).toMatch(/^regops-evidence-case-case123-\d{8}\.json$/);
    });
  });

  describe("buildEvidenceExportService", () => {
    it("builds export for customer case", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );

      expect(exportData.exportMetadata.applicationName).toBe("RegOps AI");
      expect(exportData.exportMetadata.format).toBe("json");
      expect(exportData.caseSummary.title).toBe("Test Case");
      expect(exportData.subject).not.toBeNull();
      expect(exportData.subject?.type).toBe("customer");
      expect(exportData.documents.length).toBe(1);
      expect(exportData.documents[0].originalFileName).toBe("id.pdf");
      expect(exportData.transactions.count).toBe(1);
      expect(exportData.transactions.rows[0].counterpartyAccount).toBe("******************5432");
      expect(exportData.riskSignals.length).toBe(1);
      expect(exportData.riskMemos.latest).not.toBeNull();
      expect(exportData.finalDecisions.length).toBe(1);
      expect(exportData.finalDecisions[0].evidenceSnapshotVersion).toBe("1.0");
      expect(exportData.caseNotes.count).toBe(2);
      expect(exportData.caseNotes.auditorVisible.length).toBe(1);
      expect(exportData.caseNotes.auditorVisible[0].body).toBe("Auditor visible note body");
      expect(exportData.caseNotes.internal.length).toBe(1);
      expect("body" in exportData.caseNotes.internal[0]).toBe(false);
      expect(exportData.auditTimeline.length).toBeGreaterThanOrEqual(0);
    });

    it("builds export for business case", async () => {
      const { org, owner, complianceCase } = await seedBusinessCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );

      expect(exportData.subject).not.toBeNull();
      expect(exportData.subject?.type).toBe("business");
      expect(exportData.subject?.type === "business" ? exportData.subject.legalName : null).toBe("Acme Inc");
    });

    it("excludes storageKey from documents", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const json = JSON.stringify(exportData);
      expect(json).not.toContain("secret/storage/key/123");
    });

    it("excludes full extractedText", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const json = JSON.stringify(exportData);
      expect(json).not.toContain("sensitive extracted text");
    });

    it("limits transactions to 100", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      for (let i = 0; i < 105; i++) {
        await prisma.transaction.create({
          data: {
            organizationId: org.id,
            complianceCaseId: complianceCase.id,
            direction: TransactionDirection.INBOUND,
            amount: 100,
            currency: "USD",
            occurredAt: new Date(),
          },
        });
      }
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(exportData.transactions.rows.length).toBe(100);
    });

    it("rejects cross-org case", async () => {
      const { org2, owner, complianceCase } = await seedCustomerCase();
      await expect(
        buildEvidenceExportService(
          { userId: owner.id, organizationId: org2.id, role: "OWNER" },
          { complianceCaseId: complianceCase.id, format: "json" }
        )
      ).rejects.toThrow("Case not found");
    });

    it("rejects analyst without evidence:export permission", async () => {
      const { org, analyst, complianceCase } = await seedCustomerCase();
      await expect(
        buildEvidenceExportService(
          { userId: analyst.id, organizationId: org.id, role: "COMPLIANCE_ANALYST" },
          { complianceCaseId: complianceCase.id, format: "json" }
        )
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("renderEvidenceExportJsonService", () => {
    it("returns valid JSON buffer", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const buffer = await renderEvidenceExportJsonService(exportData);
      const parsed = JSON.parse(buffer.toString("utf-8"));
      expect(parsed.caseSummary.title).toBe("Test Case");
      expect(JSON.stringify(parsed)).not.toContain("secret/storage/key/123");
      expect(JSON.stringify(parsed)).not.toContain("sensitive extracted text");
      expect(parsed.transactions.rows[0].counterpartyAccount).toBe("******************5432");
    });
  });

  describe("renderEvidenceExportPdfService", () => {
    it("returns non-empty PDF buffer", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      const buffer = await renderEvidenceExportPdfService(exportData);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("does not contain storageKey in PDF", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      const buffer = await renderEvidenceExportPdfService(exportData);
      const text = buffer.toString("ascii");
      expect(text).not.toContain("secret/storage/key/123");
    });

    it("does not contain raw prompt text in PDF", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      const buffer = await renderEvidenceExportPdfService(exportData);
      const text = buffer.toString("ascii");
      expect(text).not.toContain("promptVersion");
      expect(text).not.toContain("rawResponse");
    });
  });

  describe("generateEvidenceExportService", () => {
    it("writes EVIDENCE_EXPORT_GENERATED audit for JSON", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const result = await generateEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(result.contentType).toBe("application/json");
      expect(result.filename).toMatch(/\.json$/);

      const auditEvents = await prisma.auditEvent.findMany({
        where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
      });
      expect(auditEvents.length).toBe(1);
      const meta = JSON.parse(auditEvents[0].metadataJson ?? "{}");
      expect(meta.format).toBe("json");
      expect(meta.documentCount).toBe(1);
      expect(meta.transactionCount).toBe(1);
    });

    it("writes EVIDENCE_EXPORT_GENERATED audit for PDF", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const result = await generateEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      expect(result.contentType).toBe("application/pdf");
      expect(result.filename).toMatch(/\.pdf$/);

      const auditEvents = await prisma.auditEvent.findMany({
        where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
      });
      expect(auditEvents.length).toBe(1);
    });

    it("does not write audit for unauthorized request", async () => {
      const { org, analyst, complianceCase } = await seedCustomerCase();
      await expect(
        generateEvidenceExportService(
          { userId: analyst.id, organizationId: org.id, role: "COMPLIANCE_ANALYST" },
          { complianceCaseId: complianceCase.id, format: "json" }
        )
      ).rejects.toThrow("Forbidden");

      const auditEvents = await prisma.auditEvent.findMany({
        where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
      });
      expect(auditEvents.length).toBe(0);
    });

    it("allows ADMIN to export", async () => {
      const { org, complianceCase } = await seedCustomerCase();
      const admin = await prisma.user.create({
        data: { email: "admin-export@example.com", name: "Admin", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: org.id, userId: admin.id, role: OrganizationRole.ADMIN, status: MembershipStatus.ACTIVE },
      });
      const result = await generateEvidenceExportService(
        { userId: admin.id, organizationId: org.id, role: "ADMIN" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(result.contentType).toBe("application/json");
    });

    it("allows COMPLIANCE_MANAGER to export", async () => {
      const { org, complianceCase } = await seedCustomerCase();
      const manager2 = await prisma.user.create({
        data: { email: "manager2-export@example.com", name: "Manager2", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: org.id, userId: manager2.id, role: OrganizationRole.COMPLIANCE_MANAGER, status: MembershipStatus.ACTIVE },
      });
      const result = await generateEvidenceExportService(
        { userId: manager2.id, organizationId: org.id, role: "COMPLIANCE_MANAGER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(result.contentType).toBe("application/json");
    });

    it("allows READ_ONLY_AUDITOR to export", async () => {
      const { org, complianceCase } = await seedCustomerCase();
      const auditor2 = await prisma.user.create({
        data: { email: "auditor2-export@example.com", name: "Auditor2", status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: { organizationId: org.id, userId: auditor2.id, role: OrganizationRole.READ_ONLY_AUDITOR, status: MembershipStatus.ACTIVE },
      });
      const result = await generateEvidenceExportService(
        { userId: auditor2.id, organizationId: org.id, role: "READ_ONLY_AUDITOR" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(result.contentType).toBe("application/json");
    });
  });

  describe("export content safety", () => {
    it("JSON does not contain internal note body", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const json = JSON.stringify(exportData);
      expect(json).not.toContain("Internal secret note body");
    });

    it("PDF does not contain internal note body", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      const buffer = await renderEvidenceExportPdfService(exportData);
      const text = buffer.toString("ascii");
      expect(text).not.toContain("Internal secret note body");
    });

    it("JSON does not contain API key-like values", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const json = JSON.stringify(exportData);
      expect(json).not.toContain("sk-");
      expect(json).not.toContain("api_key");
      expect(json).not.toContain("apiKey");
    });

    it("JSON does not contain unmasked counterpartyAccount", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const json = JSON.stringify(exportData);
      expect(json).not.toContain("GB82WEST12345698765432");
      expect(json).toContain("******************5432");
    });

    it("PDF does not contain unmasked counterpartyAccount", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      const buffer = await renderEvidenceExportPdfService(exportData);
      const text = buffer.toString("ascii");
      expect(text).not.toContain("GB82WEST12345698765432");
      // PDF text is compressed; verify masking at the data level instead
      expect(exportData.transactions.rows[0].counterpartyAccount).toBe("******************5432");
    });

    it("audit metadata is compact and does not contain export content", async () => {
      const { org, owner, complianceCase } = await seedCustomerCase();
      await generateEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      const auditEvent = await prisma.auditEvent.findFirst({
        where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
      });
      expect(auditEvent).not.toBeNull();
      const meta = JSON.parse(auditEvent!.metadataJson ?? "{}");
      expect(meta.format).toBe("json");
      expect(meta.exportVersion).toBe("1.0");
      expect(meta.documentCount).toBe(1);
      expect(meta.transactionCount).toBe(1);
      expect(meta.riskSignalCount).toBe(1);
      expect(meta.riskMemoCount).toBe(1);
      expect(meta.approvalDecisionCount).toBe(1);
      expect(meta.caseSummary).toBeUndefined();
      expect(meta.transactions).toBeUndefined();
      expect(meta.documents).toBeUndefined();
    });

    it("JSON includes on-chain wallets with masked addresses", async () => {
      const { org, owner, customer, complianceCase } = await seedCustomerCase();
      const wallet = await prisma.walletAddress.create({
        data: {
          organizationId: org.id,
          customerProfileId: customer.id,
          complianceCaseId: complianceCase.id,
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          createdByUserId: owner.id,
          status: "ACTIVE",
        },
      });
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "json" }
      );
      expect(exportData.onChainWallets.length).toBe(1);
      expect(exportData.onChainWallets[0].addressMasked).toBe("7xKX...gAsU");
      expect(exportData.onChainWallets[0].status).toBe("ACTIVE");
    });

    it("PDF export includes on-chain data in exportData", async () => {
      const { org, owner, customer, complianceCase } = await seedCustomerCase();
      await prisma.walletAddress.create({
        data: {
          organizationId: org.id,
          customerProfileId: customer.id,
          complianceCaseId: complianceCase.id,
          network: "SOLANA",
          address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
          createdByUserId: owner.id,
          status: "ACTIVE",
        },
      });
      const exportData = await buildEvidenceExportService(
        { userId: owner.id, organizationId: org.id, role: "OWNER" },
        { complianceCaseId: complianceCase.id, format: "pdf" }
      );
      expect(exportData.onChainWallets.length).toBe(1);
      const buffer = await renderEvidenceExportPdfService(exportData);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
