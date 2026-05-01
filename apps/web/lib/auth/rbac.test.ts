import { describe, it, expect } from "vitest";
import { hasPermission, ALL_PERMISSIONS, ROLE_PERMISSIONS } from "./rbac";
import type { OrganizationRole, Permission } from "./rbac";

describe("RBAC permission matrix", () => {
  const roles: OrganizationRole[] = [
    "OWNER",
    "ADMIN",
    "COMPLIANCE_MANAGER",
    "COMPLIANCE_ANALYST",
    "READ_ONLY_AUDITOR",
  ];

  it.each(roles)("%s has defined permissions", (role) => {
    expect(ROLE_PERMISSIONS[role]).toBeDefined();
    expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
  });

  it("OWNER has all permissions", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("OWNER", permission)).toBe(true);
    }
  });

  it("ADMIN has all permissions", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("ADMIN", permission)).toBe(true);
    }
  });

  it("COMPLIANCE_MANAGER does not have members:update_role or members:disable", () => {
    expect(hasPermission("COMPLIANCE_MANAGER", "members:update_role")).toBe(
      false
    );
    expect(hasPermission("COMPLIANCE_MANAGER", "members:disable")).toBe(false);
  });

  it("COMPLIANCE_ANALYST only has expected permissions", () => {
    const allowed: Permission[] = [
      "organization:read",
      "cases:read",
      "cases:create",
      "cases:update",
      "documents:read",
      "documents:upload",
      "transactions:read",
      "transactions:import",
      "policies:read",
      "ai:risk_memo",
    ];

    for (const p of allowed) {
      expect(hasPermission("COMPLIANCE_ANALYST", p)).toBe(true);
    }

    expect(hasPermission("COMPLIANCE_ANALYST", "audit_logs:read")).toBe(
      false
    );
    expect(hasPermission("COMPLIANCE_ANALYST", "cases:final_decision")).toBe(
      false
    );
    expect(hasPermission("COMPLIANCE_ANALYST", "documents:archive")).toBe(
      false
    );
  });

  it("READ_ONLY_AUDITOR has read-only permissions", () => {
    expect(hasPermission("READ_ONLY_AUDITOR", "cases:read")).toBe(true);
    expect(hasPermission("READ_ONLY_AUDITOR", "audit_logs:read")).toBe(true);
    expect(hasPermission("READ_ONLY_AUDITOR", "evidence:export")).toBe(true);
    expect(hasPermission("READ_ONLY_AUDITOR", "cases:create")).toBe(false);
    expect(hasPermission("READ_ONLY_AUDITOR", "documents:upload")).toBe(false);
    expect(hasPermission("READ_ONLY_AUDITOR", "documents:archive")).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(hasPermission("UNKNOWN_ROLE" as OrganizationRole, "cases:read")).toBe(
      false
    );
  });
});
