export type OrganizationRole =
  | "OWNER"
  | "ADMIN"
  | "COMPLIANCE_MANAGER"
  | "COMPLIANCE_ANALYST"
  | "READ_ONLY_AUDITOR";

export type Permission =
  | "organization:read"
  | "organization:update"
  | "members:read"
  | "members:invite"
  | "members:update_role"
  | "members:disable"
  | "cases:read"
  | "cases:create"
  | "cases:update"
  | "cases:assign"
  | "cases:final_decision"
  | "documents:read"
  | "documents:upload"
  | "documents:archive"
  | "transactions:read"
  | "transactions:import"
  | "policies:read"
  | "policies:write"
  | "audit_logs:read"
  | "evidence:export"
  | "ai:risk_memo";

export const ALL_PERMISSIONS: Permission[] = [
  "organization:read",
  "organization:update",
  "members:read",
  "members:invite",
  "members:update_role",
  "members:disable",
  "cases:read",
  "cases:create",
  "cases:update",
  "cases:assign",
  "cases:final_decision",
  "documents:read",
  "documents:upload",
  "documents:archive",
  "transactions:read",
  "transactions:import",
  "policies:read",
  "policies:write",
  "audit_logs:read",
  "evidence:export",
  "ai:risk_memo",
];

export const ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  COMPLIANCE_MANAGER: [
    "organization:read",
    "members:read",
    "members:invite",
    "cases:read",
    "cases:create",
    "cases:update",
    "cases:assign",
    "cases:final_decision",
    "documents:read",
    "documents:upload",
    "documents:archive",
    "transactions:read",
    "transactions:import",
    "policies:read",
    "policies:write",
    "audit_logs:read",
    "evidence:export",
    "ai:risk_memo",
  ],
  COMPLIANCE_ANALYST: [
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
  ],
  READ_ONLY_AUDITOR: [
    "organization:read",
    "cases:read",
    "documents:read",
    "transactions:read",
    "policies:read",
    "audit_logs:read",
    "evidence:export",
  ],
};

export function hasPermission(
  role: OrganizationRole,
  permission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}
