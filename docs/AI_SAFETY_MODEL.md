# AI Safety Model — RegOps AI

## Advisory Only
AI-generated outputs (risk summaries, policy checks, recommendations) are strictly advisory. They do not constitute a compliance decision.

## Human Final Decision
Every material decision — approve, reject, escalate, or request evidence — must be made by a human reviewer with appropriate RBAC permissions. The system enforces this at the API level.

## Transparency
AI outputs must include citations or reasoning paths where feasible. Users must be able to understand how a summary was derived.

## Fail-Safe
If the AI provider is unavailable or returns an error, the system degrades gracefully. Human reviewers retain full capability to act without AI assistance.

## Review and Retraining
AI prompts and outputs may be logged (without PII) for quality review and prompt improvement. No customer PII is used to train external models.
