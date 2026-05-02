# Phase 9 Final Report: On-Chain Risk Intelligence MVP

## Commit Hash
`26c4dfb` — `feat(onchain): add wallet risk intelligence MVP`

## Push Status
✅ Pushed to `origin/main` (`52db3b6..26c4dfb`)

---

## 1. Summary of On-Chain Risk MVP Implementation

Phase 9 introduces a complete **wallet risk intelligence layer** for RegOps AI, enabling compliance teams to:
- Track and manage blockchain wallet addresses linked to customers, businesses, and cases
- Import on-chain transaction data via CSV
- Run deterministic on-chain risk signal rules against wallets and transactions
- Screen wallet addresses through a pluggable provider architecture (manual/mock only for MVP)
- View on-chain risk context in AI risk memos and evidence exports
- Enforce granular RBAC permissions for all on-chain operations

**Supported networks:** Solana, Ethereum, Base, Tron.

**Explicit non-goal:** No live Chainalysis, TRM, or Elliptic integration is claimed or implemented. The architecture supports future providers, but the MVP uses only a manual placeholder and a deterministic mock provider for development/testing.

---

## 2. Schema / Migration Changes

**Migration:** `20260502131507_add_onchain_models`

### New Enums
- `BlockchainNetwork` — `SOLANA`, `ETHEREUM`, `BASE`, `TRON`
- `WalletAddressStatus` — `ACTIVE`, `ARCHIVED`
- `WalletScreeningStatus` — `PENDING`, `COMPLETED`, `FAILED`
- `OnChainTransactionDirection` — `INBOUND`, `OUTBOUND`, `SELF_TRANSFER`, `UNKNOWN`

### New Models
- **`WalletAddress`** — `organizationId + network + address` unique; links to `CustomerProfile`, `BusinessProfile`, `ComplianceCase`, `User` (createdBy); soft-delete via `deletedAt`
- **`WalletScreeningRun`** — stores provider, risk score/level, categories, labels, summary; no raw provider payload stored
- **`OnChainTransaction`** — stores tx hash, direction, asset symbol/mint, `Decimal` amount/usdValue, counterparty metadata, block time; unique on `organizationId + network + txHash + walletAddressId`
- **`RiskSignal`** — extended with `walletAddressId` and `onChainTransactionId` nullable fields; indexes added for both

### Relations
- `CustomerProfile.walletAddresses`
- `BusinessProfile.walletAddresses`
- `ComplianceCase.walletAddresses`, `onChainTransactions`, `onChainRiskSignals`
- `User.createdWalletAddresses`

---

## 3. Provider Architecture and Production Safety Behavior

**Files:** `apps/web/lib/onchain/providers/{provider.ts, mock-provider.ts, provider-factory.ts, errors.ts}`

### Architecture
- `OnChainProvider` interface: `screenWalletAddress({ network, address }) => WalletScreeningResult`
- `WalletScreeningResult` contains: `provider`, `providerRunId?`, `riskScore`, `riskLevel`, `categories`, `labels`, `summary`
- Factory: `createOnChainProvider()` reads `ONCHAIN_RISK_PROVIDER` env var

### Production Safety (Fail-Closed)
- `ONCHAIN_RISK_PROVIDER=manual` (default): returns `ManualOnChainProvider` which throws when live screening is called; screening results must be imported via CSV
- `ONCHAIN_RISK_PROVIDER=mock`: returns `MockOnChainProvider` with deterministic fake data
- **Mock provider is blocked in production unless `REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION=true`**
- `getMockProviderWarning()` returns a `DANGER` warning when mock is active in production without the override flag
- Unknown provider names throw `OnChainConfigurationError`

### Confirmations
- ✅ Mock on-chain provider is blocked in production unless `REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION=true`
- ✅ No live Chainalysis/TRM/Elliptic integration is claimed

---

## 4. Wallet / Address Validation Behavior

**File:** `apps/web/lib/onchain/address-validation.ts`

- **Solana:** Base58, 32–44 chars
- **Ethereum / Base:** `0x` prefix + 40 hex chars, normalized to lowercase
- **Tron:** `T` prefix, 34 chars, alphanumeric

Returns `{ valid: boolean; normalizedAddress?: string; error?: string }`.

Used in `createWalletAddressService` to reject invalid addresses before DB insertion.

---

## 5. Screening Import Behavior

**File:** `apps/web/lib/onchain/screening-service.ts`

### CSV Import (`importWalletScreeningCsvService`)
- Columns: `walletAddressId`, `provider`, `riskScore`, `riskLevel`, `categories`, `labels`, `summary`
- Validates each row against existing `WalletAddress` records
- Creates `WalletScreeningRun` per valid row
- Writes `WALLET_SCREENING_RUN_CREATED` audit event
- Requires `onchain:import` permission

### Live Screening (`createWalletScreeningRunService`)
- Creates run with `PENDING` status
- Calls provider via factory
- Updates run with result
- Requires `onchain:screen` permission
- Writes `WALLET_SCREENING_RUN_CREATED` or `WALLET_SCREENING_RUN_FAILED` audit event

---

## 6. On-Chain Transaction Import Behavior

**File:** `apps/web/lib/onchain/onchain-transaction-import.ts`

### CSV Import (`importOnChainTransactionsCsvService`)
- Columns: `network`, `walletAddress`, `txHash`, `direction`, `assetSymbol`, `assetMintOrContract`, `amount`, `usdValue`, `counterpartyAddress`, `counterpartyLabel`, `counterpartyRiskLevel`, `counterpartyCategory`, `blockTime`, `complianceCaseId`
- Validates addresses via `validateWalletAddress`
- Resolves `walletAddress` string to `WalletAddress.id` via `organizationId + network + normalizedAddress`
- **Deduplication:** skips rows where `organizationId + network + txHash + walletAddressId` already exists
- Creates `OnChainTransaction` records in batch
- Writes `ONCHAIN_TRANSACTIONS_IMPORTED` audit event
- Requires `onchain:import` permission

---

## 7. Deterministic On-Chain Risk Rules

**File:** `apps/web/lib/onchain/onchain-risk-rules.ts`

Six deterministic rules implemented:

1. **`WALLET_HIGH_RISK_SCORE`** — screening `riskScore >= 80` or `riskLevel` is `HIGH`/`CRITICAL`
2. **`WALLET_HIGH_RISK_CATEGORY`** — category matches: `mixer`, `sanctioned`, `scam`, `darknet`, `terrorist_financing`, `ransomware`
3. **`HIGH_VALUE_STABLECOIN_TRANSFER`** — asset is `USDC`/`USDT`/`PYUSD`/`EURC` and `usdValue >= 10000`
4. **`RAPID_STABLECOIN_SWEEP`** — inbound then outbound stablecoin within 30 minutes, amount within 10%
5. **`HIGH_RISK_COUNTERPARTY`** — `counterpartyRiskLevel` is `HIGH`/`CRITICAL` or category matches high-risk list
6. **`CROSS_CHAIN_RISK_PATTERN`** — same case, 2+ networks within 24h, aggregate stablecoin value >= $10k

### Idempotency
Uses `evidenceHash` with `UNIQUE(organizationId, ruleId, evidenceHash)` to prevent duplicate risk signals.

### Masking
- Wallet addresses are masked with `maskWalletAddress(address)` → `abcd...wxyz`
- Applied in AI context builder and evidence exports

---

## 8. Routes / Pages / UI Changes

### New Pages
| Route | Permission | Description |
|-------|-----------|-------------|
| `/wallets` | `onchain:read` | Wallet list with network, masked address, latest risk level |
| `/wallets/new` | `onchain:write` | Create wallet form (network, address, label, link to entity) |
| `/wallets/[walletAddressId]` | `onchain:read` | Wallet detail: metadata, screening history, transactions, risk signals |
| `/wallets/screening-import` | `onchain:import` | CSV upload for screening results |
| `/wallets/transactions-import` | `onchain:import` | CSV upload for on-chain transactions |

### Updated Pages
- **`/cases/[caseId]`** — Added Wallets panel, On-Chain Transactions panel, On-Chain Risk Signals panel; "Run On-Chain Risk Checks" action (conditional on `onchain:screen`)
- **`/customers/[customerId]`** — Added linked wallets panel
- **`/businesses/[businessId]`** — Added linked wallets panel
- **`/dashboard` layout** — Added "Wallets" nav link

---

## 9. AI Context Integration

**File:** `apps/web/lib/ai/context-builder.ts`

`buildRiskMemoContextService` now includes:
- `onChainWallets` — linked wallets with masked addresses
- `onChainTransactions` — recent transactions (amount, direction, asset, counterparty label)
- `onChainRiskSignals` — on-chain rule hits with severity and description

All addresses are masked. Raw provider payloads and API keys are excluded.

### Confirmations
- ✅ Wallet addresses are masked in AI context
- ✅ Raw provider payloads/API keys are not stored in exports or AI context

---

## 10. Evidence Export Integration

**File:** `apps/web/lib/exports/evidence-export-service.ts`

`buildEvidenceExportService` now fetches and includes:
- `onChainWallets` — masked addresses
- `onChainTransactions` — full tx data
- `onChainRiskSignals` — rule hits

PDF renderer includes dedicated sections for each. Nullish coalescing (`?? []`, `?? { count: 0, rows: [] }`) protects legacy cases without on-chain data.

### Confirmations
- ✅ Wallet addresses are masked in evidence exports
- ✅ Raw provider payloads/API keys are not stored in exports

---

## 11. RBAC Enforcement Summary

**File:** `apps/web/lib/auth/rbac.ts`

### New Permissions
- `onchain:read` — view wallets and on-chain data
- `onchain:write` — create/archive wallets
- `onchain:screen` — run wallet screening / on-chain risk checks
- `onchain:import` — import screening results and transactions via CSV

### Role Matrix
| Role | read | write | screen | import |
|------|------|-------|--------|--------|
| OWNER | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ |
| COMPLIANCE_MANAGER | ✅ | ✅ | ✅ | ✅ |
| COMPLIANCE_ANALYST | ✅ | ✅ | ✅ | ✅ |
| READ_ONLY_AUDITOR | ✅ | ❌ | ❌ | ❌ |

### Confirmations
- ✅ READ_ONLY_AUDITOR can read only and cannot write/import/screen
- ✅ COMPLIANCE_ANALYST can write/import/screen but cannot final-decision cases (unchanged from prior phases)

---

## 12. Audit Events Implemented

| Event | Trigger |
|-------|---------|
| `WALLET_ADDRESS_CREATED` | `createWalletAddressService` |
| `WALLET_ADDRESS_ARCHIVED` | `archiveWalletAddressService` |
| `WALLET_SCREENING_RUN_CREATED` | `createWalletScreeningRunService` (success) |
| `WALLET_SCREENING_RUN_FAILED` | `createWalletScreeningRunService` (error) |
| `ONCHAIN_TRANSACTIONS_IMPORTED` | `importOnChainTransactionsCsvService` |
| `ONCHAIN_RISK_SIGNALS_GENERATED` | `runOnChainRiskChecksForCaseService` / `runOnChainRiskChecksForWalletService` |

All include `organizationId`, `userId`, and relevant entity IDs.

---

## 13. Seed Data Changes

**File:** `packages/database/prisma/seed.ts`

Added deterministic demo on-chain data scoped to `acme-remittance-eu`:
- **Solana wallet** — linked to Maria Garcia (customer), address validated
- **EVM/Base wallet** — linked to Global Payments Ltd (business)
- **Tron wallet** — linked to AML Review case
- **Wallet screening run** — `riskLevel: HIGH`, `categories: ["sanctioned"]`, provider `manual`
- **4 on-chain stablecoin transactions** — high-value USDC transfer, rapid sweep pattern, high-risk counterparty
- **3 on-chain risk signals** — generated by deterministic rules

**Cleanup fix:** `seed-cleanup.ts` now deletes `WalletAddress` records before `User` records to avoid FK constraint `WalletAddress_createdByUserId_fkey`.

---

## 14. Tests Added and Exact Results by Package

### `@regops-ai/web` — 378 tests passed (31 files)

**New on-chain test files (81 tests):**
| File | Tests |
|------|-------|
| `lib/onchain/address-validation.test.ts` | 17 |
| `lib/onchain/providers/provider-factory.test.ts` | 9 |
| `lib/onchain/wallet-service.test.ts` | 12 |
| `lib/onchain/screening-service.test.ts` | 7 |
| `lib/onchain/onchain-transaction-import.test.ts` | 6 |
| `lib/onchain/onchain-risk-rules.test.ts` | 21 |
| `lib/onchain/onchain-risk-service.test.ts` | 5 |

**Updated test files:**
- `lib/ai/context-builder.test.ts` — 10 tests
- `lib/exports/evidence-export-service.test.ts` — 34 tests
- `lib/auth/rbac.test.ts` — 11 tests

### `@regops-ai/ai` — 25 tests passed (1 file)
- `src/provider.test.ts` — unchanged, still passing

### `@regops-ai/database` — 16 tests passed (2 files)
- `src/seed-cleanup.test.ts` — 10 tests
- `src/helpers/helpers.test.ts` — 6 tests

### Root `pnpm test` — 6 packages, 6 successful
- Total: 419 tests across all packages

---

## 15. Commands Run and Exact Results

### `pnpm install`
```
Scope: all 7 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.4s using pnpm v10.32.1
```
✅ **PASS**

### `docker compose up -d postgres`
```
NAME                 IMAGE         COMMAND                  SERVICE    CREATED        STATUS                    PORTS
regops-ai-postgres   postgres:16   "docker-entrypoint.s…"   postgres   27 hours ago   Up 58 minutes (healthy)   0.0.0.0:5432->5432/tcp
```
✅ **PASS** (already running and healthy)

### `pnpm db:generate`
```
Tasks:    1 successful, 1 total
```
✅ **PASS**

### `pnpm db:migrate`
```
Already in sync, no schema change or pending migration was found.
Running generate...
```
✅ **PASS**

### `pnpm db:seed`
```
Start seeding...
Organization: Acme Remittance EU (cmoofami900008ngk3gfkia5r)
...
On-chain transactions created: 4
On-chain risk signals created: 3
Seeding finished.
```
✅ **PASS**

### `pnpm test:setup`
```
✅ WEB_TEST_DATABASE_URL ready: regops_ai_web_test
✅ DATABASE_TEST_DATABASE_URL ready: regops_ai_database_test
🎉 All test databases are ready.
```
✅ **PASS**

### `pnpm --filter @regops-ai/web test`
```
Test Files  31 passed (31)
     Tests  378 passed (378)
```
✅ **PASS**

### `pnpm --filter @regops-ai/ai test`
```
Test Files  1 passed (1)
     Tests  25 passed (25)
```
✅ **PASS**

### `pnpm --filter @regops-ai/database test`
```
Test Files  2 passed (2)
     Tests  16 passed (16)
```
✅ **PASS**

### `pnpm lint`
```
Tasks:    6 successful, 6 total
✔ No ESLint warnings or errors
```
✅ **PASS**

### `pnpm typecheck`
```
Tasks:    6 successful, 6 total
```
✅ **PASS**

### `pnpm test` (root)
```
Tasks:    6 successful, 6 total
@regops-ai/web: 378 passed
@regops-ai/ai: 25 passed
@regops-ai/database: 16 passed
```
✅ **PASS**

### `pnpm build`
```
Tasks:    1 successful, 1 total
Route (app)                                     Size  First Load JS
├ ƒ /wallets                                   196 B         105 kB
├ ƒ /wallets/[walletAddressId]                 196 B         105 kB
├ ƒ /wallets/new                               196 B         105 kB
├ ƒ /wallets/screening-import                  196 B         105 kB
└ ƒ /wallets/transactions-import               196 B         105 kB
```
✅ **PASS**

### `git status`
```
On branch main
Your branch is up to date with 'origin/main'.
```
✅ **All changes committed and pushed**

---

## 16. Warnings / Issues

1. **Next.js lint deprecation:** `next lint` is deprecated and will be removed in Next.js 16. Recommendation: migrate to ESLint CLI per Next.js guidance.
2. **Prisma config deprecation:** `package.json#prisma` is deprecated in Prisma 7. Recommendation: migrate to `prisma.config.ts`.
3. **Build warnings:** `jose` library uses `CompressionStream`/`DecompressionStream` Node.js APIs not supported in Edge Runtime. This is a pre-existing warning from Auth.js v5 and does not affect the Node.js server runtime.
4. **No live on-chain provider:** The MVP uses only `manual` (CSV import) and `mock` (deterministic fake data) providers. A production deployment must configure a real provider integration (Chainalysis, TRM, Elliptic) before relying on screening results.
5. **Address validation limitations:** Validation is regex-based and does not verify on-chain existence or checksums for EVM addresses.

---

## 17. Git Commit Hash

`26c4dfb`

---

## 18. Push Status

✅ Pushed to `origin/main` (`52db3b6..26c4dfb`)

---

## 19. Exact Next Recommended Phase

**Phase 10: Live On-Chain Provider Integration & Real-Time Screening**

### Scope Recommendation
1. **Implement Chainalysis/KYT or TRM Labs provider adapter**
   - Add `chainalysis-provider.ts` or `trm-provider.ts` implementing `OnChainProvider`
   - Store API key in environment (never in DB or exports)
   - Add request/response logging with PII redaction
   - Add circuit breaker / retry logic for provider failures

2. **Webhook support for real-time screening updates**
   - Add `webhookSecret` to `Organization` settings
   - Create `/api/webhooks/onchain-screening` route
   - Update `WalletScreeningRun` status asynchronously

3. **Transaction monitoring pipeline**
   - Poll or subscribe to on-chain data via RPC/WebSocket
   - Auto-import transactions for tracked wallets
   - Trigger real-time risk signal evaluation

4. **Enhanced address validation**
   - EVM checksum verification (EIP-55)
   - Solana address pubkey validity check
   - Tron address base58decode + hash verification

5. **Compliance reporting enhancements**
   - SAR narrative auto-generation from on-chain risk signals
   - Chain-of-custody graph visualization
   - Cross-entity wallet clustering

---

*Report generated: 2026-05-02*
