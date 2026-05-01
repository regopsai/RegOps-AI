# RegOps AI

Compliance-native AI back office for regulated fintech operations.

## Overview

RegOps AI helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## Monorepo Structure

- `apps/web` — Next.js App Router application with auth and dashboard
- `packages/database` — Prisma database client and domain helpers
- `packages/ai` — AI provider interfaces (implementation TBD)
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
- **Case workspace** (`/cases/[caseId]`) — View case details, risk signals, transactions, documents, notes, audit timeline; update status, assign, add notes (RBAC-enforced)

### Customer & Business Profiles
- **Customers** (`/customers`) — Read-only list with filters and search
- **Customer detail** (`/customers/[customerId]`) — Profile summary, related cases, transactions, documents, risk signals
- **Businesses** (`/businesses`) — Read-only list with filters and search
- **Business detail** (`/businesses/[businessId]`) — Profile summary, related cases, transactions, documents, risk signals

### Auth & Access Control
- Role-based access control with 5 roles and 20 permissions
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
