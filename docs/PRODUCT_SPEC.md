# Product Specification — RegOps AI

## Product Goal
RegOps AI is a compliance-native AI back office for regulated fintech operations. It helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## MVP Scope
1. **Case Management**: Create, view, and manage compliance cases (KYB/KYC/AML).
   - Case list with filters (status, risk level, subject type, assignee) and search
   - Case workspace with notes, risk signals, transactions, documents, audit timeline
   - Case status updates (OPEN, IN_REVIEW, ESCALATED, CLOSED)
   - Assignment to organization members
2. **Customer & Business Profiles**: Read-only profile views with related cases, transactions, documents, and risk signals.
3. **Document & Evidence Management**: Secure upload, storage, download, and archive of compliance documents. Server-side file validation (magic bytes, MIME, extension, size, SHA-256). Text extraction for PDF, TXT, CSV. Images accepted without OCR.
4. **Transaction Import**: CSV import with validation, deduplication (skip/fail modes), batch tracking, and linking to customers/businesses/cases.
5. **Deterministic AML Risk Signals**: Rule-based risk detection (high-value, structuring, high-risk country, rapid flow, many counterparties, missing profile data, missing documents). Idempotent generation with evidence hashing.
6. **AI Risk Memo Generation**: Structured advisory risk memos generated from case evidence (profile, documents, transactions, risk signals, notes). Includes executive summary, document/transaction review, risk signal synthesis, missing information checklist, recommended action, evidence references, and limitations. Human acceptance workflow with optional case note creation. AI is strictly advisory.
7. **Evidence Export**: Auditor-ready evidence export packs in JSON and PDF formats. Includes sanitized case data, document metadata, transaction summaries with masked account numbers, risk signals, AI memos, final decisions, auditor-visible notes, and audit timeline. Excludes storage keys, extracted text, raw prompts, and internal note bodies.
8. **Human Oversight**: Every approval, rejection, or escalation requires a human reviewer.
9. **Audit Trail**: Immutable event log for every case action and decision.
10. **Evidence Management**: Attach and export documents and evidence tied to cases.
11. **Tenant Isolation**: Multi-tenant architecture ensuring strict data separation.
12. **RBAC**: Role-based access control with 5 roles and 27 permissions.
13. **On-Chain Risk Intelligence MVP**: Wallet address registry, manual/provider screening signal import, on-chain transaction CSV import, deterministic on-chain risk signals, and wallet panels on case/customer/business pages.

## On-Chain Risk Intelligence MVP
- **Supported Networks**: Solana, Ethereum, Base, Tron
- **Wallet Address Registry**: Register wallet addresses linked to customers, businesses, or cases with validation per network.
- **Wallet Screening**: Manual/provider screening result import via CSV (production-safe). Mock provider available for dev/tests only.
- **On-Chain Transaction Import**: CSV import of on-chain transactions with deduplication.
- **Deterministic On-Chain Risk Rules**:
  - Wallet high risk score/category from screening results
  - High-value stablecoin transfer (>= 10,000)
  - Rapid stablecoin sweep (inbound + outbound within 30 min)
  - High-risk counterparty
  - Cross-chain risk pattern (2+ networks within 24h, aggregate >= 10,000)
- **AI Context Integration**: On-chain wallets and transactions are included in risk memo context (masked addresses).
- **Evidence Export Integration**: On-chain wallets, transactions, and risk signals are included in evidence export packs.
- **No Live Provider APIs**: Chainalysis/TRM/Elliptic API integration is NOT included in this phase. Provider signals must be imported manually or via CSV.
- **No Sanctions Screening Claims**: Risk signals are indicators only, not legal conclusions.

## Non-Goals (for MVP)
- Real-time transaction monitoring
- Regulatory filing automation
- Public API for external integrators
- Mobile-native applications
- ~~Approval decisions (APPROVED/REJECTED)~~ — implemented in Phase 7
- Policy Q&A chatbot — reserved for later phase
- Autonomous compliance decisions — explicitly out of scope

## Target Users
- Compliance officers
- Risk analysts
- Operations managers
- Internal auditors

## Domain Model Summary

### Core Entities
- **Organization**: The top-level tenant. All business data is scoped by organization.
- **User**: Global user identity. Memberships link users to organizations with roles.
- **OrganizationMember**: Join table with role and status.
- **PasswordCredential**: Separately stored hashed password for each user.

### Profiles
- **CustomerProfile**: Individual customers (KYC).
- **BusinessProfile**: Corporate customers (KYB).

### Operations
- **Transaction**: Financial transactions linked to profiles or cases. Uses `Decimal` for amounts.
- **Document**: Uploaded evidence with extraction metadata.
- **ComplianceCase**: The central compliance review unit.
- **CaseNote**: Human-written notes on cases.

### Risk & Decisions
- **RiskSignal**: Automated or manual risk flags.
- **RiskAssessment**: Structured risk evaluation.
- **RiskMemo**: AI-generated advisory memo (separate from human decisions).
- **ApprovalDecision**: Immutable human decision on a case.

### Governance
- **PolicyDocument**: Organization policies, versioned.
- **PolicyChunk**: Searchable segments of policies.
- **AuditEvent**: Append-only log of all significant actions.
- **AgentRun**: Record of AI invocations (input, output, tokens, status).

## Roles and Permissions

| Permission | OWNER | ADMIN | COMPLIANCE_MANAGER | COMPLIANCE_ANALYST | READ_ONLY_AUDITOR |
|---|---|---|---|---|---|
| organization:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| organization:update | ✓ | ✓ | — | — | — |
| members:read | ✓ | ✓ | ✓ | — | — |
| members:invite | ✓ | ✓ | ✓ | — | — |
| members:update_role | ✓ | ✓ | — | — | — |
| members:disable | ✓ | ✓ | — | — | — |
| cases:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| cases:create | ✓ | ✓ | ✓ | ✓ | — |
| cases:update | ✓ | ✓ | ✓ | ✓ | — |
| cases:assign | ✓ | ✓ | ✓ | — | — |
| cases:final_decision | ✓ | ✓ | ✓ | — | — |
| documents:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| documents:upload | ✓ | ✓ | ✓ | ✓ | — |
| documents:archive | ✓ | ✓ | ✓ | — | — |
| transactions:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| transactions:import | ✓ | ✓ | ✓ | ✓ | — |
| transactions:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| transactions:import | ✓ | ✓ | ✓ | ✓ | — |
| policies:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| policies:write | ✓ | ✓ | ✓ | — | — |
| audit_logs:read | ✓ | ✓ | ✓ | — | ✓ |
| evidence:export | ✓ | ✓ | ✓ | — | ✓ |
| ai:risk_memo | ✓ | ✓ | ✓ | ✓ | — |

## Evidence Export Limitations
- Evidence exports are **not legal filings by themselves** and must be reviewed by the human compliance team.
- Source uploaded documents are **not embedded** in the exported PDF. Only metadata and summaries are included.
- Raw document text, storage keys, and API keys are never included in exports.
- Counterparty account numbers are masked (last 4 characters only).
- Internal case note bodies are excluded from exports.
- Export content is scoped to a single organization; cross-organization export is not supported.
