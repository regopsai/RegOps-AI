# Security Model — RegOps AI

## Tenant Isolation
Every customer organization operates in a strictly isolated tenant. All data queries must be scoped by `organizationId`. There is no cross-tenant data access under any circumstance.

Database helpers enforce this by requiring `organizationId` in `where` clauses for all tenant-scoped queries. For example:
- `getComplianceCaseForOrganization(organizationId, caseId)` will never return a case belonging to a different organization.
- `listComplianceCasesForOrganization(organizationId)` is filtered strictly by the provided tenant.

## Role-Based Access Control (RBAC)
Permissions are enforced at the API layer based on roles:
- **Admin**: Tenant configuration, user management
- **Compliance Officer**: Full case lifecycle, decisions, exports
- **Analyst**: Read-only case access, AI summaries
- **Auditor**: Read-only access to audit trails and reports

## Audit Trail
All significant actions (case creation, decision, AI invocation, evidence upload) are recorded in an append-only audit log. Logs are tamper-evident and scoped by tenant.

- `AuditEvent` has no `updatedAt` field.
- Only `createAuditEvent` is exposed; no update or delete helpers exist.

## Data Handling
- PII and sensitive documents are encrypted at rest.
- Credentials and API keys are stored in environment variables, never in source code.
- Least-privilege database access.
