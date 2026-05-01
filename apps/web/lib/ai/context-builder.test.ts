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
} from "@regops-ai/database";
import { buildRiskMemoContextService } from "./context-builder";

async function cleanupTestData() {
  const tables = [
    "AuditEvent",
    "ApprovalDecision",
    "RiskMemo",
    "AgentRun",
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

async function seedOrgWithCase() {
  const org = await prisma.organization.create({
    data: { name: "Org", slug: "org", status: OrganizationStatus.ACTIVE },
  });

  const owner = await prisma.user.create({
    data: { email: "owner@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });

  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  const customer = await prisma.customerProfile.create({
    data: {
      organizationId: org.id,
      firstName: "Alice",
      lastName: "Smith",
      status: ProfileStatus.ACTIVE,
      riskLevel: RiskLevel.LOW,
      nationality: "US",
      countryOfResidence: "US",
      dateOfBirth: new Date("1990-01-01"),
    },
  });

  const caseRecord = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Case 1", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });

  return { org, owner, customer, caseRecord };
}

describe("buildRiskMemoContextService", () => {
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

  it("includes case profile summary", async () => {
    const { org, caseRecord } = await seedOrgWithCase();
    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.caseSummary.title).toBe("Case 1");
    expect(context.profileSummary.type).toBe("individual");
    expect(context.profileSummary.displayName).toBe("Alice Smith");
  });

  it("includes document metadata and extracted text snippet", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    const doc = await prisma.document.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        type: DocumentType.ID_DOCUMENT,
        status: DocumentStatus.EXTRACTED,
        originalFileName: "passport.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        storageKey: "test/passport.pdf",
        uploadedByUserId: owner.id,
        extractedText: "Name: Alice Smith\nNationality: US\nDate of birth: 1990-01-01",
      },
    });

    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.documents).toHaveLength(1);
    expect(context.documents[0].id).toBe(doc.id);
    expect(context.documents[0].extractedTextSnippet).toContain("Alice Smith");
  });

  it("includes transaction summary", async () => {
    const { org, customer, caseRecord } = await seedOrgWithCase();
    const tx = await prisma.transaction.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        externalReference: "TXN-001",
        direction: TransactionDirection.INBOUND,
        amount: 5000,
        currency: "USD",
        counterpartyName: "Alice",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      },
    });

    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.transactions).toHaveLength(1);
    expect(context.transactions[0].id).toBe(tx.id);
    expect(context.transactions[0].amount).toBe("5000");
  });

  it("includes deterministic risk signals", async () => {
    const { org, customer, caseRecord } = await seedOrgWithCase();
    const signal = await prisma.riskSignal.create({
      data: {
        organizationId: org.id,
        complianceCaseId: caseRecord.id,
        customerProfileId: customer.id,
        ruleId: "HIGH_VALUE_TRANSACTION",
        title: "High-value transaction",
        description: "Large amount detected",
        severity: "HIGH",
        evidenceJson: JSON.stringify({ amount: "50000" }),
        evidenceHash: "test-hash-001",
      },
    });

    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.riskSignals).toHaveLength(1);
    expect(context.riskSignals[0].id).toBe(signal.id);
  });

  it("includes notes", async () => {
    const { org, owner, caseRecord } = await seedOrgWithCase();
    const note = await prisma.caseNote.create({
      data: {
        organizationId: org.id,
        complianceCaseId: caseRecord.id,
        authorUserId: owner.id,
        body: "Initial review looks good.",
        visibility: "INTERNAL",
      },
    });

    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.notes).toHaveLength(1);
    expect(context.notes[0].id).toBe(note.id);
  });

  it("enforces organization isolation", async () => {
    const { caseRecord } = await seedOrgWithCase();
    const orgB = await prisma.organization.create({
      data: { name: "Org B", slug: "org-b", status: OrganizationStatus.ACTIVE },
    });

    await expect(buildRiskMemoContextService(orgB.id, caseRecord.id)).rejects.toThrow("Case not found");
  });

  it("truncates long extracted text", async () => {
    const { org, owner, customer, caseRecord } = await seedOrgWithCase();
    await prisma.document.create({
      data: {
        organizationId: org.id,
        customerProfileId: customer.id,
        complianceCaseId: caseRecord.id,
        type: DocumentType.ID_DOCUMENT,
        status: DocumentStatus.EXTRACTED,
        originalFileName: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        storageKey: "test/huge.pdf",
        uploadedByUserId: owner.id,
        extractedText: "A".repeat(5000),
      },
    });

    const result = await buildRiskMemoContextService(org.id, caseRecord.id);
    const context = JSON.parse(result.contextJson);
    expect(context.documents[0].extractedTextSnippet).toContain("[... truncated ...]");
  });

  it("contextHash is stable for same context", async () => {
    const { org, caseRecord } = await seedOrgWithCase();
    const result1 = await buildRiskMemoContextService(org.id, caseRecord.id);
    const result2 = await buildRiskMemoContextService(org.id, caseRecord.id);
    expect(result1.contextHash).toBe(result2.contextHash);
  });
});
