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
import { importTransactionsService } from "./import-service";
import type { ActorContext } from "./import-service";

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
    data: { organizationId: orgA.id, externalReference: "CUST-A", firstName: "Alice", lastName: "Smith", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const customerB = await prisma.customerProfile.create({
    data: { organizationId: orgB.id, externalReference: "CUST-B", firstName: "Bob", lastName: "Jones", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.HIGH },
  });

  const businessA = await prisma.businessProfile.create({
    data: { organizationId: orgA.id, externalReference: "BUS-A", legalName: "Business A Ltd", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.MEDIUM },
  });

  const caseA = await prisma.complianceCase.create({
    data: { organizationId: orgA.id, customerProfileId: customerA.id, title: "Case A", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: ownerA.id },
  });

  return { orgA, orgB, ownerA, analystA, auditorA, managerA, ownerB, customerA, customerB, businessA, caseA };
}

function ctx(userId: string, orgId: string, role: OrganizationRole): ActorContext {
  return { userId, organizationId: orgId, role };
}

function makeCsv(rows: string[]): Buffer {
  return Buffer.from(rows.join("\n"));
}

describe("importTransactionsService", () => {
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

  it("imports valid rows and creates batch record", async () => {
    const { orgA, ownerA, customerA, caseA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference,complianceCaseId",
      `TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A,${caseA.id}`,
    ]);

    const result = await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(1);
    expect(result.totalRows).toBe(1);

    const batch = await prisma.transactionImportBatch.findFirst({
      where: { organizationId: orgA.id },
    });
    expect(batch).not.toBeNull();
    expect(batch?.status).toBe("COMPLETED");
    expect(batch?.importedRows).toBe(1);

    const tx = await prisma.transaction.findFirst({
      where: { organizationId: orgA.id, externalReference: "TXN-001" },
    });
    expect(tx).not.toBeNull();
    expect(tx?.amount.toString()).toBe("5000");
    expect(tx?.customerProfileId).toBe(customerA.id);
    expect(tx?.complianceCaseId).toBe(caseA.id);

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: orgA.id, action: "TRANSACTIONS_IMPORTED" },
    });
    expect(audits).toHaveLength(1);
  });

  it("skip duplicates mode skips duplicate externalReference", async () => {
    const { orgA, ownerA, customerA } = await seedTwoOrgs();
    const csv1 = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv1,
      fileName: "test1.csv",
      mode: "SKIP_DUPLICATES",
    });

    const csv2 = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    const result = await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv2,
      fileName: "test2.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(0);
    expect(result.skippedRows).toBe(1);
  });

  it("fail on duplicates mode fails import", async () => {
    const { orgA, ownerA, customerA } = await seedTwoOrgs();
    const csv1 = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv1,
      fileName: "test1.csv",
      mode: "SKIP_DUPLICATES",
    });

    const csv2 = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    await expect(
      importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileBuffer: csv2,
        fileName: "test2.csv",
        mode: "FAIL_ON_DUPLICATES",
      })
    ).rejects.toThrow("duplicate externalReference");
  });

  it("rejects cross-org case link", async () => {
    const { orgA, orgB, ownerA, ownerB } = await seedTwoOrgs();
    const caseB = await prisma.complianceCase.create({
      data: { organizationId: orgB.id, title: "Case B", status: CaseStatus.OPEN, riskLevel: RiskLevel.HIGH, openedByUserId: ownerB.id },
    });

    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,complianceCaseId",
      `TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,${caseB.id}`,
    ]);

    const result = await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(0);
    expect(result.failedRows).toBe(1);
  });

  it("rejects cross-org customer link", async () => {
    const { orgA, ownerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-B",
    ]);

    const result = await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(0);
    expect(result.failedRows).toBe(1);
  });

  it("rejects cross-org business link", async () => {
    const { orgA, ownerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,businessExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,BUS-B",
    ]);

    const result = await importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(0);
    expect(result.failedRows).toBe(1);
  });

  it("auditor cannot import", async () => {
    const { orgA, auditorA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z",
    ]);

    await expect(
      importTransactionsService(ctx(auditorA.id, orgA.id, "READ_ONLY_AUDITOR"), {
        fileBuffer: csv,
        fileName: "test.csv",
        mode: "SKIP_DUPLICATES",
      })
    ).rejects.toThrow("Forbidden: missing permission transactions:import");
  });

  it("analyst can import", async () => {
    const { orgA, analystA, customerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    const result = await importTransactionsService(ctx(analystA.id, orgA.id, "COMPLIANCE_ANALYST"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(1);
  });

  it("manager can import", async () => {
    const { orgA, managerA, customerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference",
      "TXN-001,INBOUND,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z,CUST-A",
    ]);

    const result = await importTransactionsService(ctx(managerA.id, orgA.id, "COMPLIANCE_MANAGER"), {
      fileBuffer: csv,
      fileName: "test.csv",
      mode: "SKIP_DUPLICATES",
    });

    expect(result.importedRows).toBe(1);
  });

  it("does not import any rows when file-level validation fails", async () => {
    const { orgA, ownerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount",
      "TXN-001,INBOUND,5000.00",
    ]);

    await expect(
      importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileBuffer: csv,
        fileName: "test.csv",
        mode: "SKIP_DUPLICATES",
      })
    ).rejects.toThrow("CSV validation failed");

    const count = await prisma.transaction.count({ where: { organizationId: orgA.id } });
    expect(count).toBe(0);
  });

  it("does not import any rows when FAIL_ON_DUPLICATES and row errors exist", async () => {
    const { orgA, ownerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt",
      "TXN-001,INVALID,5000.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-15T10:00:00Z",
    ]);

    await expect(
      importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileBuffer: csv,
        fileName: "test.csv",
        mode: "FAIL_ON_DUPLICATES",
      })
    ).rejects.toThrow("validation errors");

    const count = await prisma.transaction.count({ where: { organizationId: orgA.id } });
    expect(count).toBe(0);
  });

  it("writes TRANSACTION_IMPORT_FAILED audit on failed import", async () => {
    const { orgA, ownerA } = await seedTwoOrgs();
    const csv = makeCsv([
      "externalReference,direction,amount",
      "TXN-001,INBOUND,5000.00",
    ]);

    await expect(
      importTransactionsService(ctx(ownerA.id, orgA.id, "OWNER"), {
        fileBuffer: csv,
        fileName: "test.csv",
        mode: "SKIP_DUPLICATES",
      })
    ).rejects.toThrow();

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: orgA.id, action: "TRANSACTION_IMPORT_FAILED" },
    });
    expect(audits).toHaveLength(1);
  });
});
