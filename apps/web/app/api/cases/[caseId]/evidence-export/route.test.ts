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
import { GET } from "./route";

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
    data: { name: "Export Route Org", slug: "export-route-org", status: OrganizationStatus.ACTIVE },
  });
  const owner = await prisma.user.create({
    data: { email: "owner-route@example.com", name: "Owner", status: UserStatus.ACTIVE },
  });
  const analyst = await prisma.user.create({
    data: { email: "analyst-route@example.com", name: "Analyst", status: UserStatus.ACTIVE },
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
    data: { organizationId: org.id, customerProfileId: customer.id, title: "Export Case", status: CaseStatus.OPEN, riskLevel: RiskLevel.LOW, openedByUserId: owner.id },
  });
  return { org, owner, analyst, openCase };
}

vi.mock("@/lib/auth/server", () => ({
  requirePermission: vi.fn(),
}));

const { requirePermission } = await import("@/lib/auth/server");

describe("GET /api/cases/[caseId]/evidence-export", () => {
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

  it("returns 400 for invalid format", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=xml`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid format");
  });

  it("returns JSON with correct content type", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const cd = response.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain(".json");
    const body = await response.json();
    expect(body.caseSummary.title).toBe("Export Case");
  });

  it("returns PDF with correct content type", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=pdf`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const cd = response.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain(".pdf");
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString("ascii", 0, 4)).toBe("%PDF");
  });

  it("returns 403 for analyst", async () => {
    const { org, analyst, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Forbidden: missing permission evidence:export"));

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 404 for non-existent case", async () => {
    const { org, owner } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/non-existent/evidence-export?format=json`);
    const response = await GET(request, { params: Promise.resolve({ caseId: "non-existent" }) });
    expect(response.status).toBe(404);
  });

  it("does not write audit on unauthorized request", async () => {
    const { org, analyst, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Forbidden: missing permission evidence:export"));

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });

    const auditEvents = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
    });
    expect(auditEvents.length).toBe(0);
  });

  it("writes audit on successful JSON export", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });

    const auditEvents = await prisma.auditEvent.findMany({
      where: { organizationId: org.id, action: "EVIDENCE_EXPORT_GENERATED" },
    });
    expect(auditEvents.length).toBe(1);
  });

  it("returns safe filename in Content-Disposition", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    const cd = response.headers.get("Content-Disposition");
    expect(cd).toMatch(/^attachment; filename="regops-evidence-case-[^"]+-\d{8}\.json"$/);
  });

  it("does not expose raw Prisma errors", async () => {
    const { org, owner, openCase } = await seedOrg();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: owner.id, name: owner.name, email: owner.email },
      organization: { id: org.id, name: org.name },
      membership: { role: OrganizationRole.OWNER },
    });

    const request = new Request(`http://localhost/api/cases/${openCase.id}/evidence-export?format=json`);
    const response = await GET(request, { params: Promise.resolve({ caseId: openCase.id }) });
    if (response.status >= 400) {
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("prisma");
      expect(JSON.stringify(body)).not.toContain("sql");
      expect(JSON.stringify(body)).not.toContain("query");
    }
  });
});
