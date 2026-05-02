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
| **COMPLIANCE_MANAGER** | Read/write cases, assign, final decision, members read/invite, documents read/upload/archive, transactions read/import, policies, audit logs, evidence export, AI risk memo, onchain read/write/screen/import |
| **COMPLIANCE_ANALYST** | Read/write cases, documents read/upload (no archive), transactions read/import, policies read, AI risk memo, onchain read/write/screen/import |
| **READ_ONLY_AUDITOR** | Read-only access to cases, documents read/download (no upload/archive), transactions read (no import), policies, audit logs, evidence export, onchain read only |

## Rate Limiting
Login attempts are rate-limited per IP (5 attempts per 15 minutes). The current implementation uses an in-memory store suitable for local development only. Production deployments must replace this with a distributed rate limiter (e.g., Redis, Upstash, or cloud WAF rules).

## Server Action Security
All mutations are implemented as Next.js Server Actions with the following enforcement:
- **`requirePermission(permission)`** is called before any database operation. Unauthorized users are redirected to `/dashboard`.
- **`requireOrganizationContext()`** ensures the user has an active membership in the current organization.
- **Tenant isolation** — Every query includes `organizationId`. Cases, customers, businesses, and audit events are never fetched by `id` alone.
- **Input validation** — All form inputs are validated with Zod schemas before database writes.
- **Status restrictions** — Normal UI status updates are restricted to OPEN, IN_REVIEW, ESCALATED, CLOSED. APPROVED and REJECTED are reserved for the final decision workflow only.

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
- On-chain audit events: `WALLET_ADDRESS_CREATED`, `WALLET_ADDRESS_ARCHIVED`, `WALLET_SCREENING_RUN_CREATED`, `WALLET_SCREENING_RUN_FAILED`, `ONCHAIN_TRANSACTIONS_IMPORTED`, `ONCHAIN_RISK_SIGNALS_GENERATED`.

## Document Upload Security
- **File validation**: All uploads are validated server-side for allowed extension, MIME type, magic bytes, size limit, and SHA-256 checksum.
- **Rejected formats**: Executable files, archives, scripts, and unknown formats are rejected.
- **Storage isolation**: Files are stored with organization-scoped keys. Raw storage keys are never exposed to the client.
- **No public URLs**: Downloads are served through protected API routes with RBAC checks.
- **No malware scanning in this phase**: Malware scanning is not yet integrated. Production deployments must add AV scanning before accepting untrusted uploads.

### Document Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Upload | `documents:upload` | OWNER, ADMIN, COMPLIANCE_MANAGER, COMPLIANCE_ANALYST |
| Download | `documents:read` | All roles |
| Archive | `documents:archive` | OWNER, ADMIN, COMPLIANCE_MANAGER |
| List/View | `documents:read` | All roles |

### Transaction Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Import | `transactions:import` | OWNER, ADMIN, COMPLIANCE_MANAGER, COMPLIANCE_ANALYST |
| List/View | `transactions:read` | All roles |

### Risk Signal Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Run checks | `cases:update` | OWNER, ADMIN, COMPLIANCE_MANAGER, COMPLIANCE_ANALYST |

### Final Decision Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Make final decision | `cases:final_decision` | OWNER, ADMIN, COMPLIANCE_MANAGER |
| View decision history | `cases:read` | All roles |

### Evidence Export Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Export case evidence (JSON/PDF) | `evidence:export` | OWNER, ADMIN, COMPLIANCE_MANAGER, READ_ONLY_AUDITOR |

### Evidence Export Safety
- Exports are strictly advisory and must be reviewed by human compliance staff.
- Exports never include raw storage keys, extracted text, API keys, raw AI prompts, or raw context.
- `counterpartyAccount` values are masked (last 4 characters only).
- Internal note bodies are excluded from exports; only auditor-visible note bodies are included.
- Audit metadata in exports is summarized and redacts sensitive keys.
- Each successful export writes an `EVIDENCE_EXPORT_GENERATED` audit event.
- Unauthorized export attempts do not write success audit events.
- Cross-organization export attempts return 404 and do not leak case existence.

### AI Risk Memo Permissions
| Action | Required Permission | Who Can |
|---|---|---|
| Generate memo | `ai:risk_memo` | OWNER, ADMIN, COMPLIANCE_MANAGER, COMPLIANCE_ANALYST |
| Accept memo | `cases:update` | OWNER, ADMIN, COMPLIANCE_MANAGER, COMPLIANCE_ANALYST |

### Final Decision Safety
- `ApprovalDecision` is immutable: no `updatedAt` field, no update helper, no delete helper exported from the database package.
- Only the `makeFinalDecisionService` can set case status to `APPROVED` or `REJECTED`.
- Normal `changeCaseStatusService` explicitly rejects `APPROVED` and `REJECTED`.
- Terminal cases (`APPROVED`, `REJECTED`, `CLOSED`) reject new final decisions.
- Evidence snapshots are safe: no extractedText, storageKey, note bodies, memo text, API keys, or raw prompts.
- Audit event `APPROVAL_DECISION_CREATED` includes decision, previousStatus, newStatus, reviewerUserId, evidenceSnapshotVersion, approvalDecisionId, createdCaseNoteId, and latestRiskMemoId. It never includes the full reason, full snapshot, or sensitive content.
- Decision creation, case status update, optional note creation, and audit events are all inside a single Prisma transaction.

### AI Provider Safety
- `AI_PROVIDER=mock` is blocked in production unless `REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION=true`.
- Missing `AI_PROVIDER` in production throws a configuration error (fail-closed).
- `AI_PROVIDER=openai-compatible` requires both `AI_API_KEY` and `AI_MODEL`.
- Unknown `AI_PROVIDER` values throw a configuration error.
- No silent fallback to mock provider in production.
- AgentRun does not store API keys, raw request headers, or full prompts.
- Audit events do not store full prompts, memo text, or document content.

### Text Extraction Behavior
- **PDF**: Extracted via pdfjs-dist (text-based PDFs only). Status → EXTRACTED. Audit event `DOCUMENT_EXTRACTION_COMPLETED`.
- **TXT/CSV**: Read as UTF-8 text. Status → EXTRACTED. Audit event `DOCUMENT_EXTRACTION_COMPLETED`.
- **Images** (PNG/JPEG): Marked UNSUPPORTED with metadata `reason: "OCR not implemented in this phase"`. Status stays UPLOADED. No extraction audit event created.
- **Extraction failures**: Do not reject the upload. Status → FAILED. Audit event `DOCUMENT_EXTRACTION_FAILED`. The stored file is not deleted.
- **No extracted text in audit metadata**: Audit events contain source metadata only, never the extracted content.

## Data Handling
- PII and sensitive documents are encrypted at rest.
- Credentials and API keys are stored in environment variables, never in source code.
- Least-privilege database access.

## Test Infrastructure Safety
- Tests run against isolated databases (`regops_ai_web_test`, `regops_ai_database_test`), never the development or production database.
- Test setup scripts guard against production URLs and refuse to create databases without `test` in the name.
- No secrets are printed during test database setup.

## Evidence Export Security
- PDF generation uses `pdfkit` (server-side Node.js library). No browser-only PDF generation is used.
- Exported PDFs include a footer stating the export is advisory and must be reviewed by human compliance staff.
- Export filenames are safe and deterministic: `regops-evidence-case-{caseId}-{YYYYMMDD}.{format}`.
