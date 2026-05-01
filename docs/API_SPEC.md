# API Specification — RegOps AI

## Design Principles
1. **Server Actions**: Mutations use Next.js Server Actions for simplicity and type safety.
2. **Service Layer**: Business logic is extracted into testable service functions (`lib/cases/case-service.ts`) that accept explicit `ActorContext`. Server actions are thin wrappers.
3. **Tenant-Scoped**: Every query and mutation implicitly scopes data to the authenticated user's active organization.
4. **RBAC-Enforced**: All server actions and services verify permissions before executing.
5. **Audit-Logged**: Every mutation creates an append-only `AuditEvent`.
6. **Error Handling**: Validation errors throw with descriptive messages. Unauthorized access redirects to `/dashboard`.

## Authentication
- Auth.js v5 with JWT sessions and Credentials provider.
- Session contains `user.id`, `email`, and `name`.
- Active organization is stored in an `httpOnly` cookie (`regops_active_org`).

## Server Actions

### Case Management (`lib/cases/server.ts`)

#### `listCases(filters?)`
**Permission:** `cases:read`

Returns cases for the active organization with optional filters:
- `status?: CaseStatus` — OPEN, IN_REVIEW, ESCALATED, CLOSED, APPROVED, REJECTED
- `riskLevel?: RiskLevel` — LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN
- `assignedToUserId?: string` — Filter by assignee
- `subjectType?: "individual" | "business" | "all"` — Filter by linked profile type
- `search?: string` — Search title, customer first/last name, business legal name

#### `getCase(caseId: string)`
**Permission:** `cases:read`

Returns full case workspace including:
- Customer or business profile
- Assigned user and opened-by user
- Notes (with authors)
- Risk signals
- Transactions (last 10)
- Documents (last 10)

#### `createCase(formData: FormData)`
**Permission:** `cases:create`

Validates and creates a new compliance case. Requires exactly one subject (`customerProfileId` or `businessProfileId`).

**Fields:**
- `customerProfileId?: string` — Link to individual customer
- `businessProfileId?: string` — Link to business
- `title: string` (1-200 chars, required)
- `description?: string` (max 5000 chars)
- `riskLevel: string` (required, one of LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN)
- `assignedToUserId?: string` — Must be an active org member

**Side effects:** Creates `CASE_CREATED` audit event, revalidates `/cases`, redirects to new case.

#### `updateCase(caseId: string, formData: FormData)`
**Permission:** `cases:update`

Updates case title, description, and/or risk level.

**Fields:**
- `title?: string` (1-200 chars)
- `description?: string` (max 5000 chars)
- `riskLevel?: string` (LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN)

**Side effects:** Creates `CASE_UPDATED` audit event, revalidates paths.

#### `assignCase(caseId: string, userId: string | null)`
**Permission:** `cases:assign`

Assigns or unassigns a case. `userId` must be an active org member (or `null` for unassigned).

**Side effects:** Creates `CASE_ASSIGNED` audit event, revalidates paths.

#### `changeCaseStatus(caseId: string, status: CaseStatus)`
**Permission:** `cases:update`

Updates case status. Only allows OPEN, IN_REVIEW, ESCALATED, CLOSED. APPROVED and REJECTED are rejected.

**Side effects:** Creates `CASE_STATUS_UPDATED` audit event, revalidates paths. Sets `closedAt` when status is CLOSED.

#### `addCaseNote(caseId: string, formData: FormData)`
**Permission:** `cases:update`

Adds a note to a case.

**Fields:**
- `body: string` (1-10000 chars, required)
- `visibility?: string` — INTERNAL (default) or AUDITOR_VISIBLE

**Side effects:** Creates `CASE_NOTE_CREATED` audit event, revalidates case page.

#### `getCaseAuditEvents(caseId: string)`
**Permission:** `cases:read`

Returns audit events for a specific case (entityType: ComplianceCase or CaseNote), ordered by newest first.

## Service Functions

### `lib/cases/case-service.ts`

All case business logic lives in testable service functions that accept `ActorContext`:

```typescript
interface ActorContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}
```

Service functions include:
- `listCasesService`, `getCaseService` — reads (require `cases:read`)
- `createCaseService` — creates case with subject validation, member validation, audit event (require `cases:create`)
- `updateCaseService` — updates title/description/risk with audit event (require `cases:update`)
- `assignCaseService` — assigns/unassigns with active-member validation and audit event (require `cases:assign`)
- `changeCaseStatusService` — status update with restriction to OPEN/IN_REVIEW/ESCALATED/CLOSED and audit event (require `cases:update`)
- `addCaseNoteService` — note creation with case ownership verification and audit event (require `cases:update`)
- `getCustomerService`, `getBusinessService` — profile reads

### Customer & Business Profiles

#### `listCustomers(search?)` / `listBusinesses(search?)`
**Permission:** `cases:read`

Returns customers or businesses for the active organization with optional search.

#### `getCustomer(customerId: string)` / `getBusiness(businessId: string)`
**Permission:** `cases:read`

Returns full profile with related cases, transactions, documents, and risk signals.

## Audit Events

### Actions
| Action | Description |
|---|---|
| `USER_LOGIN` | User authenticated successfully |
| `CASE_CREATED` | New compliance case opened |
| `CASE_UPDATED` | Case title, description, or risk level changed |
| `CASE_ASSIGNED` | Case assigned to a different user |
| `CASE_STATUS_UPDATED` | Case status changed |
| `CASE_NOTE_CREATED` | Note added to a case |
| `ORGANIZATION_CREATED` | Organization created (seed) |
| `CASE_OPENED` | Case opened (seed) |
| `CASE_ESCALATED` | Case escalated (seed) |
| `RISK_SIGNAL_CREATED` | Risk signal generated |
| `RISK_MEMO_GENERATED` | AI risk memo generated successfully |
| `RISK_MEMO_GENERATION_FAILED` | AI risk memo generation failed |
| `RISK_MEMO_ACCEPTED` | Human reviewer accepted AI risk memo |
| `DOCUMENT_UPLOADED` | Document uploaded |
| `DOCUMENT_DOWNLOADED` | Document downloaded |
| `DOCUMENT_ARCHIVED` | Document archived |
| `DOCUMENT_EXTRACTION_COMPLETED` | Text extraction succeeded |
| `DOCUMENT_EXTRACTION_FAILED` | Text extraction failed |

## Data Validation

### Create Case Schema
- Exactly one of `customerProfileId` or `businessProfileId` must be provided
- `title`: 1-200 characters, required
- `description`: max 5000 characters, optional
- `riskLevel`: one of LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN, required
- `assignedToUserId`: optional, validated against active org members

### Status Restrictions
Normal UI operations can only set:
- `OPEN`
- `IN_REVIEW`
- `ESCALATED`
- `CLOSED`

`APPROVED` and `REJECTED` are reserved for the final approval decision workflow (later phase).

## Document Management

### API Routes

#### `POST /api/documents/upload`
**Permission:** `documents:upload`

Multipart form upload with fields:
- `file` — Required. Validated server-side for extension, MIME, magic bytes, size, SHA-256.
- `type` — Required. One of: ID_DOCUMENT, PROOF_OF_ADDRESS, COMPANY_REGISTRATION, BENEFICIAL_OWNERSHIP, BANK_STATEMENT, TRANSACTION_CSV, COMPLIANCE_POLICY, OTHER.
- `complianceCaseId` — Optional. Must belong to active org.
- `customerProfileId` — Optional. Must belong to active org.
- `businessProfileId` — Optional. Must belong to active org.

At least one linked entity is required.

**Side effects:** Creates Document record, stores file, writes `DOCUMENT_UPLOADED` audit event, runs text extraction, writes extraction audit event.

#### `GET /api/documents/[documentId]/download`
**Permission:** `documents:read`

Returns the file as an attachment download. Writes `DOCUMENT_DOWNLOADED` audit event.

#### `POST /api/documents/[documentId]/archive`
**Permission:** `documents:archive`

Soft-archives the document (status = ARCHIVED). Writes `DOCUMENT_ARCHIVED` audit event.

### Service Functions (`lib/documents/document-service.ts`)

- `uploadDocumentService` — Validates file, stores via storage provider, creates DB record, audits, extracts text.
- `getDocumentDownloadService` — Verifies ownership, fetches from storage, audits.
- `archiveDocumentService` — Soft-archive with audit.
- `listDocumentsForCaseService`, `listDocumentsForCustomerService`, `listDocumentsForBusinessService` — Scoped listing.
- `getDocumentService` — Scoped detail read.

### File Validation
- Allowed extensions: .pdf, .png, .jpg, .jpeg, .csv, .txt
- Allowed MIME types: application/pdf, image/png, image/jpeg, text/csv, application/csv, text/plain
- Magic bytes verified for PDF (%PDF), PNG (89 50 4E 47), JPEG (FF D8 FF)
- Text files checked for null bytes (binary rejection)
- Max size: 10MB default (configurable via `MAX_DOCUMENT_UPLOAD_BYTES`)
- SHA-256 checksum computed and stored

### Text Extraction
- PDF: Extracted via pdfjs-dist (text-based PDFs only)
- TXT/CSV: Read as UTF-8 text
- Images: Marked as UNSUPPORTED (OCR deferred)
- Extraction failures do not reject the upload

## Transaction Import

### API Routes

#### `POST /api/transactions/import`
**Permission:** `transactions:import`

Multipart form upload with fields:
- `file` — Required. CSV file.
- `mode` — Required. `SKIP_DUPLICATES` or `FAIL_ON_DUPLICATES`.

CSV columns:
- Required: `externalReference`, `direction`, `amount`, `currency`, `counterpartyName`, `counterpartyAccount`, `counterpartyCountry`, `paymentRail`, `transactionType`, `description`, `occurredAt`
- Optional link: `customerExternalReference`, `businessExternalReference`, `complianceCaseId`

**Side effects:** Creates `TransactionImportBatch`, creates `Transaction` records, writes `TRANSACTIONS_IMPORTED` or `TRANSACTION_IMPORT_FAILED` audit event.

### Service Functions (`lib/transactions/import-service.ts`)

- `importTransactionsService` — Parses CSV, validates rows, resolves linked entities, handles deduplication, creates batch and transactions, audits.
- `listTransactionsService` — Scoped listing with filters (direction, currency, country, date range, amount, search).
- `getTransactionService` — Scoped detail read with linked entities and risk signals.

## Risk Signal Generation

### Server Actions

#### `runCaseRiskChecks(caseId: string)`
**Permission:** `cases:update`

Runs deterministic AML risk rules against case-linked transactions and profile. Creates `RiskSignal` records with `evidenceHash` for idempotency. Returns `{ created, skipped }`.

**Side effects:** Creates `RISK_SIGNALS_GENERATED` audit event.

### Deterministic Rules

| Rule | Trigger | Severity |
|---|---|---|
| HIGH_VALUE_TRANSACTION | Amount >= 10,000 (EUR/USD/GBP) | HIGH |
| STRUCTURING_PATTERN | >= 3 transactions 8,000-9,999.99 within 7 days | CRITICAL |
| HIGH_RISK_COUNTRY | Counterparty in IR, KP, SY, MM | HIGH |
| RAPID_IN_OUT_FLOW | Inbound + outbound within 24h, amounts within 10% | MEDIUM or HIGH |
| MANY_COUNTERPARTIES | >5 unique counterparties within 30 days | MEDIUM |
| MISSING_PROFILE_DATA | Missing DOB/nationality/residence (customer) or regNumber/country/industry (business) | MEDIUM |
| MISSING_REQUIRED_DOCUMENTS | Customer missing ID_DOCUMENT or PROOF_OF_ADDRESS; business missing COMPANY_REGISTRATION or BENEFICIAL_OWNERSHIP | HIGH |

### Idempotency
Risk signals use `evidenceHash` (SHA-256 of rule-specific evidence). The database enforces `UNIQUE(organizationId, ruleId, evidenceHash)`. Repeated runs skip duplicates.

## AI Risk Memo

### Server Actions

#### `generateRiskMemo(caseId: string)`
**Permission:** `ai:risk_memo`

Generates an advisory AI risk memo for a case. Builds case evidence context, invokes the AI provider, validates structured output, creates an `AgentRun` and `RiskMemo`.

**Side effects:** Creates `AgentRun` (RUNNING → SUCCEEDED/FAILED), creates `RiskMemo`, writes `RISK_MEMO_GENERATED` or `RISK_MEMO_GENERATION_FAILED` audit event.

**Returns:** `RiskMemo`

#### `acceptRiskMemo(riskMemoId: string, createCaseNoteFromMemo?: boolean)`
**Permission:** `cases:update`

Accepts an AI-generated risk memo. Sets `acceptedByUserId` and `acceptedAt`. Optionally creates a case note summarizing the memo.

**Side effects:** Updates `RiskMemo`, optionally creates `CaseNote`, writes `RISK_MEMO_ACCEPTED` audit event.

**Returns:** `{ riskMemo, caseNoteId? }`

### API Routes

#### `POST /api/cases/[caseId]/risk-memos/generate`
**Permission:** `ai:risk_memo`

Programmatic endpoint to generate a risk memo. Returns structured result or safe error.

#### `POST /api/risk-memos/[riskMemoId]/accept`
**Permission:** `cases:update`

Accepts a risk memo. Body may include `createCaseNoteFromMemo: boolean`.

### Service Functions (`lib/ai/`)

- `buildRiskMemoContextService` — Fetches case evidence, builds structured context, computes hash, truncates long text safely.
- `generateRiskMemoService` — Permission check, case validation, context building, AgentRun lifecycle, AI provider invocation, output validation, RiskMemo creation, audit logging.
- `acceptRiskMemoService` — Permission check, memo validation, acceptance update, optional case note creation, audit logging.

### Risk Memo Schema

AI output is validated against `riskMemoAIOutputSchema`:
- `executiveSummary` — string, required
- `profileSummary` — string, required
- `documentReview` — string, required
- `transactionReview` — string, required
- `riskSignalsSummary` — string, required
- `missingInformation` — string, required
- `recommendedAction` — enum: LOW_RISK_REVIEW, MEDIUM_RISK_REVIEW, HIGH_RISK_ESCALATION, REQUEST_MORE_INFORMATION
- `evidenceReferences` — array of { type, id, label, relevance }
- `limitations` — string, required

## Pages & Routes

| Route | Description | Required Permission |
|---|---|---|
| `/dashboard` | Organization overview | `organization:read` |
| `/cases` | Case list with filters | `cases:read` |
| `/cases/new` | Create new case | `cases:create` |
| `/cases/[caseId]` | Case workspace | `cases:read` |
| `/customers` | Customer list | `cases:read` |
| `/customers/[customerId]` | Customer detail | `cases:read` |
| `/businesses` | Business list | `cases:read` |
| `/businesses/[businessId]` | Business detail | `cases:read` |
| `/transactions` | Transaction list | `transactions:read` |
| `/transactions/import` | Import CSV | `transactions:import` |
| `/transactions/[transactionId]` | Transaction detail | `transactions:read` |
| `/settings/organization` | Org settings | `organization:read` |
| `/settings/members` | Member management | `members:read` |
| `/login` | Sign in | — |
| `/no-organization` | No org fallback | — |
