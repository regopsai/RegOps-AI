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
import { POST } from "./route";

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

async function seedOrg() {
  const org = await prisma.organization.create({
    data: { name: "API Org", slug: "api-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-api@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-api@example.com", name: "Analyst", status: UserStatus.ACTIVE },
  });
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE },
      { organizationId: org.id, userId: analyst.id, role: OrganizationRole.COMPLIANCE_ANALYST, status: MembershipStatus.ACTIVE },
    ],
  });
  const customer = await prisma.customerProfile.create({
    data: { organizationId: org.id, firstName: "Alice", lastName: "Smith", status: ProfileStatus.ACTIVE, riskLevel: RiskLevel.LOW },
  });
  const openCase = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Open Case", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });
  const approvedCase = await prisma.complianceCase.create({
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Approved Case", status: CaseStatus.APPROVED, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });
  return { org, owner, analyst, openCase, approvedCase };
}

// Mock auth server to bypass session validation
vi.mock("@/lib/auth/server", () => ({
  requirePermission: vi.fn(),
}));

const { requirePermission } = await import("@/lib/auth/server");

describe("POST /api/cases/[caseId]/decisions", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestData();
    vi.clearAllMocks();
  });

  it("returns 201 for valid decision", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request("http://localhost/api/cases/" + openCase.id + "/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reason: "Valid reason" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.decision.decision).toBe("APPROVE");
  });

  it("returns 400 for invalid decision", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id },
      organization: { id: org.id },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request("http://localhost/api/cases/" + openCase.id + "/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "INVALID", reason: "Valid reason" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 for short reason", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id },
      organization: { id: org.id },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request("http://localhost/api/cases/" + openCase.id + "/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reason: "" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(400);
  });

  it("returns 403 for analyst", async () => {
    const { org, analyst, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: analyst.id },
      organization: { id: org.id },
      membership: { role: OrganizationRole.COMPLIANCE_ANALYST },
    });

    const request = new Request("http://localhost/api/cases/" + openCase.id + "/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reason: "Valid reason" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(403);
  });

  it("returns 409 for terminal case", async () => {
    const { org, owner, approvedCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id },
      organization: { id: org.id },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request("http://localhost/api/cases/" + approvedCase.id + "/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "REJECT", reason: "Valid reason" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: approvedCase.id }) });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("Cannot make final decision");
  });

  it("returns 404 for non-existent case", async () => {
    const { org, owner } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id },
      organization: { id: org.id },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request("http://localhost/api/cases/non-existent/decisions", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reason: "Valid reason" }),
    });

    const response = await POST(request, { params: Promise.resolve({ caseId: "non-existent" }) });
    expect(response.status).toBe(404);
  });
});
