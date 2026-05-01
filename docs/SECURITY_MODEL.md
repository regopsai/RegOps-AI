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

## Auth Configuration Split
The Auth.js configuration is split for edge safety:
- **`auth.config.ts`** — Edge-safe config used by middleware. Contains no Prisma, bcryptjs, or credential verification logic.
- **`auth.ts`** — Server-only config that imports `auth.config.ts` and adds the Credentials provider with bcryptjs/Prisma verification.
- **`middleware.ts`** — Imports only from `auth.config.ts` to avoid bundling Node-only modules into the Edge Runtime.

## Role-Based Access Control (RBAC)
Permissions are enforced at the API and server-page layer based on the user's `OrganizationMember.role`:

| Role | Permissions |
|---|---|
| **OWNER** | All permissions |
| **ADMIN** | All permissions |
| **COMPLIANCE_MANAGER** | Read/write cases, assign, final decision, members read/invite, documents, transactions, policies, audit logs, evidence export, AI risk memo |
| **COMPLIANCE_ANALYST** | Read/write cases, documents, transactions, policies read, AI risk memo |
| **READ_ONLY_AUDITOR** | Read-only access to cases, documents, transactions, policies, audit logs, evidence export |

## Rate Limiting
Login attempts are rate-limited per IP (5 attempts per 15 minutes). The current implementation uses an in-memory store suitable for local development only. Production deployments must replace this with a distributed rate limiter (e.g., Redis, Upstash, or cloud WAF rules).

## Server Action Security
All mutations are implemented as Next.js Server Actions with the following enforcement:
- **`requirePermission(permission)`** is called before any database operation. Unauthorized users are redirected to `/dashboard`.
- **`requireOrganizationContext()`** ensures the user has an active membership in the current organization.
- **Tenant isolation** — Every query includes `organizationId`. Cases, customers, businesses, and audit events are never fetched by `id` alone.
- **Input validation** — All form inputs are validated with Zod schemas before database writes.
- **Status restrictions** — Normal UI status updates are restricted to OPEN, IN_REVIEW, ESCALATED, CLOSED. APPROVED and REJECTED are reserved for the final decision workflow (later phase).

## Service Layer Architecture
Business logic is extracted into testable service functions (`lib/cases/case-service.ts`) that accept an explicit `ActorContext` (`userId`, `organizationId`, `role`). This allows:
- Unit and integration testing without mocking NextAuth.
- RBAC enforcement via `hasPermission(role, permission)` inside services.
- Server actions remain thin wrappers that extract context from the session and delegate to services.

### Assignment Validation
- `assignedToUserId` is validated against active organization members before case creation or assignment.
- Cross-organization assignments are rejected.

### Case Note Defense in Depth
- `createCaseNoteForOrganization` verifies the target case exists in the same organization before creating the note.
- The server action layer also verifies case ownership before calling the helper.

## Audit Trail
All significant actions (case creation, update, assignment, status change, note creation, decision, AI invocation, evidence upload, login, organization switch) are recorded in an append-only audit log. Logs are tamper-evident and scoped by tenant.

- `AuditEvent` has no `updatedAt` field.
- Only `createAuditEvent` is exposed; no update or delete helpers exist.
- Every server action mutation creates at least one `AuditEvent` with actor, action, entity type, and metadata.

## Document Upload Security
- **File validation**: All uploads are validated server-side for allowed extension, MIME type, magic bytes, size limit, and SHA-256 checksum.
- **Rejected formats**: Executable files, archives, scripts, and unknown formats are rejected.
- **Storage isolation**: Files are stored with organization-scoped keys. Raw storage keys are never exposed to the client.
- **No public URLs**: Downloads are served through protected API routes with RBAC checks.
- **No malware scanning in this phase**: Malware scanning is not yet integrated. Production deployments must add AV scanning before accepting untrusted uploads.

## Data Handling
- PII and sensitive documents are encrypted at rest.
- Credentials and API keys are stored in environment variables, never in source code.
- Least-privilege database access.
