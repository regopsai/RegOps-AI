# RegOps AI

Compliance-native AI back office for regulated fintech operations.

## Overview

RegOps AI helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## Monorepo Structure

- `apps/web` — Next.js App Router application with auth and dashboard
- `packages/database` — Prisma database client and domain helpers
- `packages/ai` — AI provider abstraction (OpenAI-compatible + mock providers, structured JSON generation, zod schema validation)
- `packages/compliance-core` — Shared compliance domain types
- `packages/config` — Shared TypeScript and tooling configuration
- `packages/ui` — Shared UI utilities and components

## Getting Started

### Requirements
- Node.js >= 20
- pnpm >= 9
- Docker (for local PostgreSQL)

### Install

```bash
pnpm install
```

### Environment

Copy `.env.example` to `.env` and fill in values.

Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — Random string for session signing (min 32 chars)
- `AUTH_TRUST_HOST` — Set to `true` for local dev
- `REGOPS_SEED_PASSWORD` — Dev password for seed users (default: `RegOpsDev123!`)

### Database

Start local PostgreSQL and set up the schema:

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

### Development

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) and sign in with one of the demo accounts below.

## Demo Accounts

The seed script creates these users (all with the same dev password):

| Email | Role |
|---|---|
| `owner@acme-remittance.test` | Owner |
| `manager@acme-remittance.test` | Compliance Manager |
| `analyst@acme-remittance.test` | Compliance Analyst |
| `auditor@acme-remittance.test` | Read-only Auditor |

**Dev password:** `RegOpsDev123!`

## Application Features

### Case Management
- **Cases list** (`/cases`) — Filter by status, risk level, subject type, assignee; search by title/customer/business name
- **New case** (`/cases/new`) — Create cases linked to individual customers or businesses
- **Case workspace** (`/cases/[caseId]`) — View case details, risk signals, transactions, documents, notes, AI risk memos, audit timeline; update status, assign, add notes, generate/accept AI risk memos (RBAC-enforced)

### Transaction Import
- **Transactions** (`/transactions`) — List with filters (direction, currency, country, date range, amount, search) and import button
- **Transaction import** (`/transactions/import`) — CSV upload with mode selector and result summary
- **Transaction detail** (`/transactions/[transactionId]`) — Full details, linked entities, risk signals

### Deterministic AML Risk Signals
Rules implemented:
- HIGH_VALUE_TRANSACTION: flags transactions above currency threshold (default 10,000)
- STRUCTURING_PATTERN: detects multiple sub-threshold deposits within 7 days
- HIGH_RISK_COUNTRY: flags transactions involving sanctioned/high-risk countries (IR, KP, SY, MM)
- RAPID_IN_OUT_FLOW: detects similar inbound/outbound within 24 hours
- MANY_COUNTERPARTIES: flags >5 unique counterparties within 30 days
- MISSING_PROFILE_DATA: flags incomplete customer/business profiles
- MISSING_REQUIRED_DOCUMENTS: flags missing ID/proof-of-address/registration docs
- Idempotent generation with evidenceHash deduplication

### Customer & Business Profiles
- **Customers** (`/customers`) — Read-only list with filters and search
- **Customer detail** (`/customers/[customerId]`) — Profile summary, related cases, transactions, documents, risk signals
- **Businesses** (`/businesses`) — Read-only list with filters and search
- **Business detail** (`/businesses/[businessId]`) — Profile summary, related cases, transactions, documents, risk signals

### Auth & Access Control
- Role-based access control with 5 roles and 23 permissions
- Organization-scoped data isolation
- Every mutation creates an append-only audit event

## Auth Architecture

Auth.js v5 is configured with an edge-safe split:
- **`auth.config.ts`** — Shared config used by middleware (no Prisma/bcryptjs)
- **`auth.ts`** — Server-only config with Credentials provider and database verification
- **`middleware.ts`** — Edge-safe route protection using only `auth.config.ts`

## Database Commands

- `pnpm db:generate` — Generate Prisma client
- `pnpm db:validate` — Validate schema
- `pnpm db:migrate` — Run migrations
- `pnpm db:seed` — Seed demo data
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:reset` — Reset database

## Build, Lint, Typecheck, and Test

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

### Test Coverage

- **RBAC**: Permission matrix validation for all 5 roles.
- **Access control**: Disabled/deleted user authentication rejection, organization membership validation.
- **Case validation**: Zod schema validation for case creation (subject selection, title length, risk level, description).
- **Case service integration tests** (real Postgres):
  - Tenant isolation: org A cannot read/update/assign/note org B cases, customers, or businesses.
  - RBAC: role-based permission enforcement at service level.
  - Audit events: every mutation writes a correctly scoped `AuditEvent`.
  - Status restrictions: APPROVED/REJECTED rejected, OPEN/IN_REVIEW/ESCALATED/CLOSED accepted.
  - Assignment validation: only active org members can be assigned.
- **Document validation**: Magic bytes, MIME type, extension, size limit, SHA-256 checksum.
- **Storage provider tests**: Local put/get/delete, path traversal blocking, S3 config error.
- **Document service integration tests** (real Postgres):
  - Tenant isolation: org A cannot read/download/archive org B documents.
  - Cross-org linking blocked: cannot upload document linked to org B case/customer/business.
  - RBAC: auditor read-only; analyst can upload/import; manager/owner/admin full access.
  - Audit events: DOCUMENT_UPLOADED, DOCUMENT_DOWNLOADED, DOCUMENT_ARCHIVED, DOCUMENT_EXTRACTION_COMPLETED/FAILED.
  - Text extraction: PDF text extraction, TXT/CSV extraction, images marked unsupported (no OCR).
- **Transaction import integration tests** (real Postgres):
  - CSV parsing, validation, deduplication, cross-org link rejection, batch tracking, audit events.
- **Risk rule unit tests**:
  - All 7 deterministic AML rules: threshold, structuring, high-risk country, rapid flow, many counterparties, missing profile data, missing documents.
- **Risk signal generation integration tests**:
  - Idempotency, audit events, cross-org rejection.
- **AI provider unit tests**:
  - Mock provider deterministic output, OpenAI-compatible provider request building, timeout handling, error response handling, API key redaction.
- **Risk memo schema tests**:
  - Valid output acceptance, unsupported action rejection, empty string rejection, evidence reference validation.
- **Context builder integration tests**:
  - Profile/documents/transactions/signals/notes inclusion, organization isolation, text truncation, hash stability.
- **Risk memo generation integration tests**:
  - AgentRun lifecycle, RiskMemo creation, audit events, failure handling, no ApprovalDecision creation, no case status change, RBAC enforcement, cross-org rejection.
- **Risk memo acceptance integration tests**:
  - Acceptance workflow, case note creation, audit events, no ApprovalDecision creation, no case status change, idempotency, RBAC enforcement, cross-org rejection.

## Tech Stack

- pnpm workspace + Turborepo
- Next.js App Router + TypeScript (strict)
- Tailwind CSS
- ESLint + Prettier
- Prisma + PostgreSQL
- Auth.js v5 (NextAuth) + bcryptjs
- Vitest (testing)

## License

Proprietary — All rights reserved.
