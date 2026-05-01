# AI Safety Model — RegOps AI

## Advisory Only
AI-generated outputs (risk memos, policy checks, recommendations) are strictly advisory. They do not constitute a compliance decision.

## Human Final Decision
Every material decision — approve, reject, escalate, or request evidence — must be made by a human reviewer with appropriate RBAC permissions. The system enforces this at the service and API level.

- `ApprovalDecision` is immutable: it has no `updatedAt` and no update helper.
- `RiskMemo` is advisory and linked to `AgentRun` (AI output), not to `ApprovalDecision` (human output).
- AI never creates `ApprovalDecision` records.
- AI never changes case status to APPROVED or REJECTED.
- AI never sets case risk level automatically.
- The decision service does not import or call any AI provider.
- A human reviewer can make a final decision that contradicts the AI's `recommendedAction` (e.g., CLOSE_NO_ACTION when AI recommends HIGH_RISK_ESCALATION).

## Separation of AI and Human Outputs
- **AgentRun**: Stores the raw AI invocation (provider, model, prompt version, input hash, output JSON, token usage, status, error). This is the system record of what the AI produced. Prompt content is not stored; only an input hash is kept for reproducibility.
- **RiskMemo**: A structured representation of AI advice, derived from an `AgentRun`. Contains executive summary, profile summary, document review, transaction review, risk signal synthesis, missing information, recommended action, evidence references, and limitations.
- **ApprovalDecision**: The immutable human decision. It never references an `AgentRun` directly; the human reviewer may consult a `RiskMemo` but the decision stands on its own.

## Prompt Versioning
Risk memos use a versioned prompt: `risk-memo-v1`. This ensures reproducibility and allows gradual prompt improvements with clear version tracking.

## Context Safety
The context builder includes only evidence already in the system:
- Case summary and profile metadata
- Document metadata and extracted text snippets (truncated)
- Transaction summaries (truncated)
- Deterministic risk signals
- Case notes (truncated)
- Missing data summary

The context builder does NOT include:
- Full raw document text (snippets only, truncated)
- Full transaction descriptions (truncated)
- External data not in the system
- API keys or credentials

## Output Validation
All AI outputs are validated against a strict Zod schema before storage. Invalid outputs mark the `AgentRun` as FAILED and do not create a `RiskMemo`.

Supported recommended actions:
- LOW_RISK_REVIEW
- MEDIUM_RISK_REVIEW
- HIGH_RISK_ESCALATION
- REQUEST_MORE_INFORMATION

Any unsupported action is rejected.

## Transparency
AI outputs must include citations (evidence references with IDs, labels, and relevance). Users must be able to understand how a summary was derived.

## Fail-Safe
If the AI provider is unavailable, returns an error, or produces invalid output, the system degrades gracefully:
- AgentRun is marked FAILED
- A safe error is returned to the UI
- Human reviewers retain full capability to act without AI assistance

## Audit Trail
Every AI invocation and memo acceptance creates an audit event:
- `RISK_MEMO_GENERATED` — memo created successfully
- `RISK_MEMO_GENERATION_FAILED` — provider or validation failure
- `RISK_MEMO_ACCEPTED` — human reviewer accepted the memo

Audit metadata is safe: no full prompts, no full memo text, no document text, no API keys.

## Review and Retraining
AI prompts and outputs may be logged (without PII) for quality review and prompt improvement. No customer PII is used to train external models.

## Provider Configuration Safety
- The system fails closed in production if `AI_PROVIDER` is missing or set to `mock` without explicit override.
- `AI_PROVIDER=mock` is only allowed in production when `REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION=true`.
- Mock output is deterministic fake data and must never be used for real compliance work.
- The UI displays a warning banner when the mock provider is active.

## Production Considerations
- Use a vetted model/provider with known compliance behavior
- Enable logging redaction for sensitive fields
- Monitor outputs for hallucinations or unsafe recommendations
- Keep human-in-the-loop for all material decisions
- Do not rely on AI as a legal or compliance authority
