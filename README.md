# RegOps AI

Compliance-native AI back office for regulated fintech operations.

## Overview

RegOps AI helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## Monorepo Structure

- `apps/web` — Next.js App Router application
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

### Database

Start local PostgreSQL and set up the schema:

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Available database commands:
- `pnpm db:generate` — Generate Prisma client
- `pnpm db:validate` — Validate schema
- `pnpm db:migrate` — Run migrations
- `pnpm db:seed` — Seed demo data
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:reset` — Reset database

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Lint, Typecheck, and Test

```bash
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
- Vitest (testing)

## License

Proprietary — All rights reserved.
