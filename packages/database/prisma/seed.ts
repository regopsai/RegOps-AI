import { prisma } from "../src/client";
import bcryptjs from "bcryptjs";
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
  CaseNoteVisibility,
  ApprovalDecisionType,
  PolicyStatus,
} from "@prisma/client";

async function main() {
  console.log("Start seeding...");

  // Idempotent: use slug for organization, email for users
  const org = await prisma.organization.upsert({
    where: { slug: "acme-remittance-eu" },
    update: {},
    create: {
      name: "Acme Remittance EU",
      slug: "acme-remittance-eu",
      status: OrganizationStatus.ACTIVE,
    },
  });
  console.log(`Organization: ${org.name} (${org.id})`);

  const usersData = [
    {
      email: "owner@acme-remittance.test",
      name: "Jordan Owner",
      role: OrganizationRole.OWNER,
    },
    {
      email: "manager@acme-remittance.test",
      name: "Alex Manager",
      role: OrganizationRole.COMPLIANCE_MANAGER,
    },
    {
      email: "analyst@acme-remittance.test",
      name: "Sam Analyst",
      role: OrganizationRole.COMPLIANCE_ANALYST,
    },
    {
      email: "auditor@acme-remittance.test",
      name: "Pat Auditor",
      role: OrganizationRole.READ_ONLY_AUDITOR,
    },
  ];

  const users: Record<string, { id: string; email: string }> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        status: UserStatus.ACTIVE,
      },
    });
    users[u.role] = user;
    console.log(`User: ${user.email} (${user.id})`);

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        userId: user.id,
        role: u.role,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    const seedPassword = process.env.REGOPS_SEED_PASSWORD || "RegOpsDev123!";
    const passwordHash = await bcryptjs.hash(seedPassword, 12);

    await prisma.passwordCredential.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });
  }

  const ownerUser = users[OrganizationRole.OWNER];
  const managerUser = users[OrganizationRole.COMPLIANCE_MANAGER];
  const analystUser = users[OrganizationRole.COMPLIANCE_ANALYST];

  const individualCustomer = await prisma.customerProfile.create({
    data: {
      organizationId: org.id,
      externalReference: "CUST-001",
      firstName: "Maria",
      lastName: "Garcia",
      email: "maria.garcia@example.com",
      phone: "+34 600 000 001",
      dateOfBirth: new Date("1985-03-15"),
      nationality: "ES",
      countryOfResidence: "ES",
      addressLine1: "Calle Mayor 12",
      city: "Madrid",
      postalCode: "28013",
      country: "ES",
      riskLevel: RiskLevel.MEDIUM,
      status: ProfileStatus.ACTIVE,
    },
  });
  console.log(`CustomerProfile: ${individualCustomer.firstName} ${individualCustomer.lastName}`);

  const businessCustomer = await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      externalReference: "BUS-001",
      legalName: "Global Payments Ltd",
      tradingName: "GPay",
      registrationNumber: "B12345678",
      taxId: "ESB12345678",
      incorporationCountry: "IE",
      operatingCountry: "ES",
      website: "https://gpay.example.com",
      industry: "Fintech",
      riskLevel: RiskLevel.HIGH,
      status: ProfileStatus.UNDER_REVIEW,
    },
  });
  console.log(`BusinessProfile: ${businessCustomer.legalName}`);

  const transactions = await prisma.transaction.createMany({
    data: [
      {
        organizationId: org.id,
        customerProfileId: individualCustomer.id,
        externalReference: "TXN-001",
        direction: TransactionDirection.INBOUND,
        amount: 5000.0,
        currency: "EUR",
        counterpartyName: "Employer SA",
        counterpartyAccount: "ES91 0000 0000 00 0000000000",
        counterpartyCountry: "ES",
        paymentRail: "SEPA",
        transactionType: "SALARY",
        description: "Monthly salary deposit",
        occurredAt: new Date("2024-01-15T09:00:00Z"),
      },
      {
        organizationId: org.id,
        customerProfileId: individualCustomer.id,
        externalReference: "TXN-002",
        direction: TransactionDirection.OUTBOUND,
        amount: 1200.0,
        currency: "EUR",
        counterpartyName: "Landlord SL",
        counterpartyAccount: "ES91 0000 0000 11 1111111111",
        counterpartyCountry: "ES",
        paymentRail: "SEPA",
        transactionType: "RENT",
        description: "Rent payment",
        occurredAt: new Date("2024-01-16T10:00:00Z"),
      },
      {
        organizationId: org.id,
        businessProfileId: businessCustomer.id,
        externalReference: "TXN-003",
        direction: TransactionDirection.INBOUND,
        amount: 250000.0,
        currency: "USD",
        counterpartyName: "Investor Corp",
        counterpartyAccount: "US64 0000 0000 0000 0000",
        counterpartyCountry: "US",
        paymentRail: "WIRE",
        transactionType: "INVESTMENT",
        description: "Series A funding",
        occurredAt: new Date("2024-02-01T14:30:00Z"),
      },
      {
        organizationId: org.id,
        businessProfileId: businessCustomer.id,
        externalReference: "TXN-004",
        direction: TransactionDirection.OUTBOUND,
        amount: 50000.0,
        currency: "EUR",
        counterpartyName: "Software Vendor GmbH",
        counterpartyAccount: "DE89 0000 0000 0000 0000 00",
        counterpartyCountry: "DE",
        paymentRail: "SEPA",
        transactionType: "SOFTWARE",
        description: "Platform license annual fee",
        occurredAt: new Date("2024-02-05T11:00:00Z"),
      },
    ],
  });
  console.log(`Transactions created: ${transactions.count}`);

  const individualCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      customerProfileId: individualCustomer.id,
      title: "KYB Review — Maria Garcia",
      description: "Standard KYB review triggered by large inbound transfer.",
      status: CaseStatus.IN_REVIEW,
      riskLevel: RiskLevel.MEDIUM,
      assignedToUserId: analystUser.id,
      openedByUserId: managerUser.id,
      openedAt: new Date(),
    },
  });
  console.log(`ComplianceCase: ${individualCase.title}`);

  const businessCase = await prisma.complianceCase.create({
    data: {
      organizationId: org.id,
      businessProfileId: businessCustomer.id,
      title: "AML Review — Global Payments Ltd",
      description: "AML casework for high-risk business profile.",
      status: CaseStatus.ESCALATED,
      riskLevel: RiskLevel.HIGH,
      assignedToUserId: managerUser.id,
      openedByUserId: ownerUser.id,
      openedAt: new Date(),
    },
  });
  console.log(`ComplianceCase: ${businessCase.title}`);

  const individualCaseNote = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: individualCase.id,
      authorUserId: analystUser.id,
      body: "Initial review complete. Customer has consistent salary deposits. No adverse media found. Awaiting supervisor sign-off.",
      visibility: CaseNoteVisibility.INTERNAL,
    },
  });
  console.log(`CaseNote created for individual case`);

  const businessCaseNote1 = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: businessCase.id,
      authorUserId: managerUser.id,
      body: "Escalated to senior compliance. Business incorporated in IE but operating primarily in ES. Needs enhanced due diligence.",
      visibility: CaseNoteVisibility.AUDITOR_VISIBLE,
    },
  });

  const businessCaseNote2 = await prisma.caseNote.create({
    data: {
      organizationId: org.id,
      complianceCaseId: businessCase.id,
      authorUserId: ownerUser.id,
      body: "Approved EDD scope. Requesting UBO declarations and source of funds documentation.",
      visibility: CaseNoteVisibility.INTERNAL,
    },
  });
  console.log(`CaseNotes created for business case`);

  const docs = await prisma.document.createMany({
    data: [
      {
        organizationId: org.id,
        customerProfileId: individualCustomer.id,
        originalFileName: "maria_garcia_passport.pdf",
        storageKey: "seed/maria_garcia_passport.pdf",
        type: DocumentType.ID_DOCUMENT,
        status: DocumentStatus.UPLOADED,
        sizeBytes: 245760,
        mimeType: "application/pdf",
        uploadedByUserId: managerUser.id,
      },
      {
        organizationId: org.id,
        customerProfileId: individualCustomer.id,
        originalFileName: "maria_garcia_payslip_jan_2024.pdf",
        storageKey: "seed/maria_garcia_payslip_jan_2024.pdf",
        type: DocumentType.BANK_STATEMENT,
        status: DocumentStatus.UPLOADED,
        sizeBytes: 184320,
        mimeType: "application/pdf",
        uploadedByUserId: analystUser.id,
      },
      {
        organizationId: org.id,
        businessProfileId: businessCustomer.id,
        originalFileName: "global_payments_certificate_of_incorporation.pdf",
        storageKey: "seed/global_payments_certificate_of_incorporation.pdf",
        type: DocumentType.COMPANY_REGISTRATION,
        status: DocumentStatus.PROCESSING,
        sizeBytes: 512000,
        mimeType: "application/pdf",
        uploadedByUserId: managerUser.id,
      },
      {
        organizationId: org.id,
        businessProfileId: businessCustomer.id,
        originalFileName: "global_payments_annual_report_2023.pdf",
        storageKey: "seed/global_payments_annual_report_2023.pdf",
        type: DocumentType.BANK_STATEMENT,
        status: DocumentStatus.PROCESSING,
        sizeBytes: 1048576,
        mimeType: "application/pdf",
        uploadedByUserId: ownerUser.id,
      },
    ],
  });
  console.log(`Documents created: ${docs.count}`);

  const riskSignals = await prisma.riskSignal.createMany({
    data: [
      {
        organizationId: org.id,
        complianceCaseId: individualCase.id,
        customerProfileId: individualCustomer.id,
        ruleId: "KYB-001",
        title: "Large inbound transfer",
        description: "Inbound transfer exceeds threshold for individual account.",
        severity: RiskSignalSeverity.MEDIUM,
        evidenceJson: JSON.stringify({ threshold: 3000, actual: 5000 }),
      },
      {
        organizationId: org.id,
        complianceCaseId: businessCase.id,
        businessProfileId: businessCustomer.id,
        ruleId: "AML-003",
        title: "High-risk jurisdiction",
        description: "Incorporation country flagged as higher risk.",
        severity: RiskSignalSeverity.HIGH,
        evidenceJson: JSON.stringify({ jurisdiction: "IE", riskScore: 72 }),
      },
      {
        organizationId: org.id,
        complianceCaseId: businessCase.id,
        businessProfileId: businessCustomer.id,
        ruleId: "AML-007",
        title: "Unusual transaction pattern",
        description: "Single large inbound followed by immediate outbound to multiple jurisdictions.",
        severity: RiskSignalSeverity.CRITICAL,
        evidenceJson: JSON.stringify({ inbound: 250000, outbound: 50000, destinations: ["DE", "FR"] }),
      },
    ],
  });
  console.log(`RiskSignals created: ${riskSignals.count}`);

  const policyDoc = await prisma.policyDocument.create({
    data: {
      organizationId: org.id,
      title: "Anti-Money Laundering Policy",
      version: "2024.1",
      status: PolicyStatus.ACTIVE,
      bodyText: "1. Purpose\nThis policy sets out the framework for AML compliance.\n\n2. Scope\nApplies to all employees and contractors.\n\n3. Customer Due Diligence\nAll customers must be verified before onboarding.\n\n4. Monitoring\nTransactions are monitored continuously for suspicious activity.\n\n5. Reporting\nSuspicious activity must be reported to the MLRO within 24 hours.",
      createdByUserId: ownerUser.id,
    },
  });
  console.log(`PolicyDocument: ${policyDoc.title}`);

  const policyChunks = await prisma.policyChunk.createMany({
    data: [
      {
        organizationId: org.id,
        policyDocumentId: policyDoc.id,
        chunkIndex: 0,
        heading: "Purpose",
        body: "This policy sets out the framework for AML compliance.",
        tokenCount: 12,
      },
      {
        organizationId: org.id,
        policyDocumentId: policyDoc.id,
        chunkIndex: 1,
        heading: "Scope",
        body: "Applies to all employees and contractors.",
        tokenCount: 8,
      },
      {
        organizationId: org.id,
        policyDocumentId: policyDoc.id,
        chunkIndex: 2,
        heading: "Customer Due Diligence",
        body: "All customers must be verified before onboarding.",
        tokenCount: 9,
      },
      {
        organizationId: org.id,
        policyDocumentId: policyDoc.id,
        chunkIndex: 3,
        heading: "Monitoring",
        body: "Transactions are monitored continuously for suspicious activity.",
        tokenCount: 10,
      },
      {
        organizationId: org.id,
        policyDocumentId: policyDoc.id,
        chunkIndex: 4,
        heading: "Reporting",
        body: "Suspicious activity must be reported to the MLRO within 24 hours.",
        tokenCount: 12,
      },
    ],
  });
  console.log(`PolicyChunks created: ${policyChunks.count}`);

  await prisma.auditEvent.createMany({
    data: [
      {
        organizationId: org.id,
        actorUserId: ownerUser.id,
        action: "ORGANIZATION_CREATED",
        entityType: "Organization",
        entityId: org.id,
        metadataJson: JSON.stringify({ source: "seed" }),
      },
      {
        organizationId: org.id,
        actorUserId: managerUser.id,
        action: "CASE_OPENED",
        entityType: "ComplianceCase",
        entityId: individualCase.id,
        metadataJson: JSON.stringify({ caseTitle: individualCase.title }),
      },
      {
        organizationId: org.id,
        actorUserId: ownerUser.id,
        action: "CASE_ESCALATED",
        entityType: "ComplianceCase",
        entityId: businessCase.id,
        metadataJson: JSON.stringify({ caseTitle: businessCase.title, reason: "High risk" }),
      },
      {
        organizationId: org.id,
        actorUserId: analystUser.id,
        action: "RISK_SIGNAL_CREATED",
        entityType: "RiskSignal",
        entityId: "batch",
        metadataJson: JSON.stringify({ count: 3 }),
      },
      {
        organizationId: org.id,
        actorUserId: analystUser.id,
        action: "CASE_NOTE_CREATED",
        entityType: "CaseNote",
        entityId: individualCaseNote.id,
        metadataJson: JSON.stringify({ complianceCaseId: individualCase.id, visibility: "INTERNAL" }),
      },
      {
        organizationId: org.id,
        actorUserId: managerUser.id,
        action: "CASE_NOTE_CREATED",
        entityType: "CaseNote",
        entityId: businessCaseNote1.id,
        metadataJson: JSON.stringify({ complianceCaseId: businessCase.id, visibility: "AUDITOR_VISIBLE" }),
      },
      {
        organizationId: org.id,
        actorUserId: ownerUser.id,
        action: "CASE_NOTE_CREATED",
        entityType: "CaseNote",
        entityId: businessCaseNote2.id,
        metadataJson: JSON.stringify({ complianceCaseId: businessCase.id, visibility: "INTERNAL" }),
      },
      {
        organizationId: org.id,
        actorUserId: managerUser.id,
        action: "DOCUMENT_UPLOADED",
        entityType: "Document",
        entityId: "batch",
        metadataJson: JSON.stringify({ count: 4, customerProfileId: individualCustomer.id, businessProfileId: businessCustomer.id }),
      },
    ],
  });
  console.log("AuditEvents created: 8");

  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
