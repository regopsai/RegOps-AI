import { describe, it, expect } from "vitest";
import { validateTransactionRow } from "./validation";

describe("validateTransactionRow", () => {
  function row(data: Record<string, string>, rowIndex = 2) {
    return { rowIndex, raw: data };
  }

  it("accepts valid row", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.externalReference).toBe("TXN-001");
      expect(result.data.direction).toBe("INBOUND");
      expect(result.data.amount).toBe(100.00);
      expect(result.data.currency).toBe("USD");
      expect(result.data.customerExternalReference).toBe("CUST-001");
    }
  });

  it("rejects invalid direction", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INVALID",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("direction must be INBOUND or OUTBOUND");
    }
  });

  it("rejects negative amount", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "-50.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("amount must be a positive decimal");
    }
  });

  it("rejects zero amount", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "0",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("amount must be a positive decimal");
    }
  });

  it("rejects invalid currency", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "US",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("currency must be a 3-letter uppercase code");
    }
  });

  it("rejects invalid occurredAt", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "not-a-date",
      customerExternalReference: "CUST-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("occurredAt must be a valid date/time");
    }
  });

  it("rejects row with no owner link", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("At least one link is required");
    }
  });

  it("rejects row with both customer and business links", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      customerExternalReference: "CUST-001",
      businessExternalReference: "BUS-001",
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("Cannot link to both customer and business");
    }
  });

  it("accepts complianceCaseId as link", () => {
    const result = validateTransactionRow(row({
      externalReference: "TXN-001",
      direction: "INBOUND",
      amount: "100.00",
      currency: "USD",
      counterpartyName: "Alice",
      counterpartyAccount: "ACC-1",
      counterpartyCountry: "US",
      paymentRail: "SEPA",
      transactionType: "TRANSFER",
      description: "Payment",
      occurredAt: "2024-01-01T00:00:00Z",
      complianceCaseId: "CASE-001",
    }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.complianceCaseId).toBe("CASE-001");
    }
  });
});
