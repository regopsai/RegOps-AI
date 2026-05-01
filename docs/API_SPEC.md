# API Specification — RegOps AI

## Design Principles
1. **Server Actions**: Mutations use Next.js Server Actions for simplicity and type safety.
2. **Tenant-Scoped**: Every query and mutation implicitly scopes data to the authenticated user's active organization.
3. **RBAC-Enforced**: All server actions verify permissions before executing.
4. **Audit-Logged**: Every mutation creates an append-only `AuditEvent`.
5. **Error Handling**: Validation errors throw with descriptive messages. Unauthorized access redirects to `/dashboard`.

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
| `DOCUMENT_UPLOADED` | Document uploaded |

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
| `/settings/organization` | Org settings | `organization:read` |
| `/settings/members` | Member management | `members:read` |
| `/login` | Sign in | — |
| `/no-organization` | No org fallback | — |
