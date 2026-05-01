import { z } from "zod";

export const evidenceReferenceSchema = z.object({
  type: z.enum(["profile", "document", "transaction", "risk_signal", "note", "policy", "case"]),
  id: z.string().min(1),
  label: z.string().min(1),
  relevance: z.string().min(1),
});

export const riskMemoAIOutputSchema = z.object({
  executiveSummary: z.string().min(1, "executiveSummary is required"),
  profileSummary: z.string().min(1, "profileSummary is required"),
  documentReview: z.string().min(1, "documentReview is required"),
  transactionReview: z.string().min(1, "transactionReview is required"),
  riskSignalsSummary: z.string().min(1, "riskSignalsSummary is required"),
  missingInformation: z.string().min(1, "missingInformation is required"),
  recommendedAction: z.enum([
    "LOW_RISK_REVIEW",
    "MEDIUM_RISK_REVIEW",
    "HIGH_RISK_ESCALATION",
    "REQUEST_MORE_INFORMATION",
  ]),
  evidenceReferences: z.array(evidenceReferenceSchema).min(1, "At least one evidence reference is required"),
  limitations: z.string().min(1, "limitations is required"),
});

export type RiskMemoAIOutput = z.infer<typeof riskMemoAIOutputSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
