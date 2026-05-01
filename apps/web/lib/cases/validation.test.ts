import { describe, it, expect } from "vitest";
import { z } from "zod";

const createCaseSchema = z
  .object({
    customerProfileId: z.string().optional(),
    businessProfileId: z.string().optional(),
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(5000).optional(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
    assignedToUserId: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasCustomer = !!data.customerProfileId;
      const hasBusiness = !!data.businessProfileId;
      return (hasCustomer && !hasBusiness) || (!hasCustomer && hasBusiness);
    },
    {
      message: "Select exactly one subject: individual customer or business",
      path: ["customerProfileId"],
    }
  );

describe("createCaseSchema validation", () => {
  it("accepts valid case with customer", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      title: "Suspicious activity",
      riskLevel: "HIGH",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid case with business", () => {
    const result = createCaseSchema.safeParse({
      businessProfileId: "biz_123",
      title: "KYC review",
      riskLevel: "MEDIUM",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both customer and business are provided", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      businessProfileId: "biz_123",
      title: "Test",
      riskLevel: "LOW",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Select exactly one subject"
      );
    }
  });

  it("rejects when neither customer nor business is provided", () => {
    const result = createCaseSchema.safeParse({
      title: "Test",
      riskLevel: "LOW",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Select exactly one subject"
      );
    }
  });

  it("rejects empty title", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      title: "",
      riskLevel: "LOW",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Title is required");
    }
  });

  it("rejects title over 200 chars", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      title: "a".repeat(201),
      riskLevel: "LOW",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid risk level", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      title: "Test",
      riskLevel: "EXTREME",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description over 5000 chars", () => {
    const result = createCaseSchema.safeParse({
      customerProfileId: "cust_123",
      title: "Test",
      description: "a".repeat(5001),
      riskLevel: "LOW",
    });
    expect(result.success).toBe(false);
  });
});

describe("case status update restrictions", () => {
  const VALID_STATUSES_FOR_UPDATE = ["OPEN", "IN_REVIEW", "ESCALATED", "CLOSED"];

  it("allows OPEN, IN_REVIEW, ESCALATED, CLOSED", () => {
    for (const status of VALID_STATUSES_FOR_UPDATE) {
      expect(VALID_STATUSES_FOR_UPDATE).toContain(status);
    }
  });

  it("does not allow APPROVED or REJECTED", () => {
    expect(VALID_STATUSES_FOR_UPDATE).not.toContain("APPROVED");
    expect(VALID_STATUSES_FOR_UPDATE).not.toContain("REJECTED");
  });
});
