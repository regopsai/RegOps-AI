# Security Model — RegOps AI

## Tenant Isolation
Every customer organization operates in a strictly isolated tenant. All data queries must be scoped by `organizationId`. There is no cross-tenant data access under any circumstance.

Database helpers enforce this by requiring `organizationId` in `where` clauses for all tenant-scoped queries. For example:
- `getComplianceCaseForOrganization(organizationId, caseId)` will never return a case belonging to a different organization.
- `listComplianceCasesForOrganization(organizationId)` is filtered strictly by the provided tenant.

## Authentication
- Auth.js v5 with JWT sessions and Credentials provider.
- Passwords are hashed with bcryptjs (cost factor 12) and stored in the `PasswordCredential` table.
- Plaintext passwords are never stored, logged, or returned to the client.
- Inactive (`DISABLED`) or soft-deleted users cannot authenticate.

## Session Management
- JWT sessions with 30-day expiration.
- Session contains only `user.id`, `email`, and `name`.
- Active organization is stored in an `httpOnly` cookie (`regops_active_org`) validated on every request against the user's active memberships.

## Role-Based Access Control (RBAC)
Permissions are enforced at the API and server-page layer based on the user's `OrganizationMember.role`:

| Role | Permissions |
|---|---|
| **OWNER** | All permissions |
| **ADMIN** | All permissions |
| **COMPLIANCE_MANAGER** | Read/write cases, assign, final decision, members read/invite, documents, transactions, policies, audit logs, evidence export, AI risk memo |
| **COMPLIANCE_ANALYST** | Read/write cases, documents, transactions, policies read, AI risk memo |
| **READ_ONLY_AUDITOR** | Read-only access to cases, documents, transactions, policies, audit logs, evidence export |

## Audit Trail
All significant actions (case creation, decision, AI invocation, evidence upload, login, organization switch) are recorded in an append-only audit log. Logs are tamper-evident and scoped by tenant.

- `AuditEvent` has no `updatedAt` field.
- Only `createAuditEvent` is exposed; no update or delete helpers exist.

## Data Handling
- PII and sensitive documents are encrypted at rest.
- Credentials and API keys are stored in environment variables, never in source code.
- Least-privilege database access.
