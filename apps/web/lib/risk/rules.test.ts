import { describe, it, expect } from "vitest";
import {
  evaluateHighValueTransaction,
  evaluateStructuringPattern,
  evaluateHighRiskCountry,
  evaluateRapidInOutFlow,
  evaluateManyCounterparties,
  evaluateMissingProfileData,
  evaluateMissingRequiredDocuments,
} from "./rules";
import type { RuleTransaction, RuleCustomerProfile, RuleBusinessProfile, RuleDocument } from "./rules";

function tx(overrides: Partial<RuleTransaction> = {}): RuleTransaction {
  return {
    id: "tx-1",
    externalReference: "REF-1",
    direction: "INBOUND",
    amount: { toString: () => "5000.00", lessThan: (n: number) => 5000 < n },
    currency: "USD",
    counterpartyName: "Alice",
    counterpartyAccount: "ACC-1",
    counterpartyCountry: "US",
    paymentRail: "SEPA",
    transactionType: "TRANSFER",
    description: "Test",
    occurredAt: new Date("2024-01-15T10:00:00Z"),
    customerProfileId: "cust-1",
    businessProfileId: null,
    complianceCaseId: "case-1",
    ...overrides,
  };
}

describe("risk rules", () => {
  describe("HIGH_VALUE_TRANSACTION", () => {
    it("triggers for amount >= 10000 USD", () => {
      const signal = evaluateHighValueTransaction(tx({ amount: { toString: () => "15000.00", lessThan: (n: number) => 15000 < n } }));
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("HIGH");
      expect(signal?.ruleId).toBe("HIGH_VALUE_TRANSACTION");
    });

    it("does not trigger for amount below threshold", () => {
      const signal = evaluateHighValueTransaction(tx({ amount: { toString: () => "5000.00", lessThan: (n: number) => 5000 < n } }));
      expect(signal).toBeNull();
    });
  });

  describe("STRUCTURING_PATTERN", () => {
    it("triggers for 3 transactions between 8000-9999.99 within 7 days", () => {
      const transactions = [
        tx({ id: "tx-1", amount: { toString: () => "8500.00", lessThan: (n: number) => 8500 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-2", amount: { toString: () => "9000.00", lessThan: (n: number) => 9000 < n }, occurredAt: new Date("2024-01-02T10:00:00Z") }),
        tx({ id: "tx-3", amount: { toString: () => "9500.00", lessThan: (n: number) => 9500 < n }, occurredAt: new Date("2024-01-03T10:00:00Z") }),
      ];
      const signal = evaluateStructuringPattern(transactions);
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("CRITICAL");
    });

    it("does not trigger for 2 transactions only", () => {
      const transactions = [
        tx({ id: "tx-1", amount: { toString: () => "8500.00", lessThan: (n: number) => 8500 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-2", amount: { toString: () => "9000.00", lessThan: (n: number) => 9000 < n }, occurredAt: new Date("2024-01-02T10:00:00Z") }),
      ];
      const signal = evaluateStructuringPattern(transactions);
      expect(signal).toBeNull();
    });

    it("does not trigger for transactions outside range", () => {
      const transactions = [
        tx({ id: "tx-1", amount: { toString: () => "5000.00", lessThan: (n: number) => 5000 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-2", amount: { toString: () => "6000.00", lessThan: (n: number) => 6000 < n }, occurredAt: new Date("2024-01-02T10:00:00Z") }),
        tx({ id: "tx-3", amount: { toString: () => "7000.00", lessThan: (n: number) => 7000 < n }, occurredAt: new Date("2024-01-03T10:00:00Z") }),
      ];
      const signal = evaluateStructuringPattern(transactions);
      expect(signal).toBeNull();
    });
  });

  describe("HIGH_RISK_COUNTRY", () => {
    it("triggers for IR", () => {
      const signal = evaluateHighRiskCountry(tx({ counterpartyCountry: "IR" }));
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("HIGH");
    });

    it("triggers for KP", () => {
      const signal = evaluateHighRiskCountry(tx({ counterpartyCountry: "kp" }));
      expect(signal).not.toBeNull();
    });

    it("does not trigger for US", () => {
      const signal = evaluateHighRiskCountry(tx({ counterpartyCountry: "US" }));
      expect(signal).toBeNull();
    });

    it("does not trigger for null country", () => {
      const signal = evaluateHighRiskCountry(tx({ counterpartyCountry: null }));
      expect(signal).toBeNull();
    });
  });

  describe("RAPID_IN_OUT_FLOW", () => {
    it("triggers for inbound and outbound within 24h with similar amounts", () => {
      const transactions = [
        tx({ id: "tx-in", direction: "INBOUND", amount: { toString: () => "10000.00", lessThan: (n: number) => 10000 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-out", direction: "OUTBOUND", amount: { toString: () => "10100.00", lessThan: (n: number) => 10100 < n }, occurredAt: new Date("2024-01-01T20:00:00Z") }),
      ];
      const signal = evaluateRapidInOutFlow(transactions);
      expect(signal).not.toBeNull();
      expect(signal?.ruleId).toBe("RAPID_IN_OUT_FLOW");
    });

    it("does not trigger when amounts differ by more than 10%", () => {
      const transactions = [
        tx({ id: "tx-in", direction: "INBOUND", amount: { toString: () => "10000.00", lessThan: (n: number) => 10000 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-out", direction: "OUTBOUND", amount: { toString: () => "13000.00", lessThan: (n: number) => 13000 < n }, occurredAt: new Date("2024-01-01T20:00:00Z") }),
      ];
      const signal = evaluateRapidInOutFlow(transactions);
      expect(signal).toBeNull();
    });

    it("does not trigger when transactions are more than 24h apart", () => {
      const transactions = [
        tx({ id: "tx-in", direction: "INBOUND", amount: { toString: () => "10000.00", lessThan: (n: number) => 10000 < n }, occurredAt: new Date("2024-01-01T10:00:00Z") }),
        tx({ id: "tx-out", direction: "OUTBOUND", amount: { toString: () => "10100.00", lessThan: (n: number) => 10100 < n }, occurredAt: new Date("2024-01-03T10:00:00Z") }),
      ];
      const signal = evaluateRapidInOutFlow(transactions);
      expect(signal).toBeNull();
    });
  });

  describe("MANY_COUNTERPARTIES", () => {
    it("triggers for more than 5 unique counterparties within 30 days", () => {
      const now = new Date();
      const transactions = Array.from({ length: 6 }, (_, i) =>
        tx({ id: `tx-${i}`, counterpartyName: `Counterparty ${i}`, occurredAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000) })
      );
      const signal = evaluateManyCounterparties(transactions);
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("MEDIUM");
    });

    it("does not trigger for 5 or fewer counterparties", () => {
      const now = new Date();
      const transactions = Array.from({ length: 5 }, (_, i) =>
        tx({ id: `tx-${i}`, counterpartyName: `Counterparty ${i}`, occurredAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000) })
      );
      const signal = evaluateManyCounterparties(transactions);
      expect(signal).toBeNull();
    });
  });

  describe("MISSING_PROFILE_DATA", () => {
    it("triggers for customer missing dateOfBirth, nationality, countryOfResidence", () => {
      const customer: RuleCustomerProfile = {
        id: "cust-1",
        dateOfBirth: null,
        nationality: null,
        countryOfResidence: null,
      };
      const signal = evaluateMissingProfileData(customer, null);
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("MEDIUM");
      const evidence = JSON.parse(signal?.evidenceJson ?? "{}");
      expect(evidence.missingFields).toContain("dateOfBirth");
    });

    it("does not trigger for complete customer profile", () => {
      const customer: RuleCustomerProfile = {
        id: "cust-1",
        dateOfBirth: new Date("1990-01-01"),
        nationality: "US",
        countryOfResidence: "US",
      };
      const signal = evaluateMissingProfileData(customer, null);
      expect(signal).toBeNull();
    });

    it("triggers for business missing registrationNumber", () => {
      const business: RuleBusinessProfile = {
        id: "bus-1",
        registrationNumber: null,
        incorporationCountry: "US",
        industry: "Tech",
      };
      const signal = evaluateMissingProfileData(null, business);
      expect(signal).not.toBeNull();
      const evidence = JSON.parse(signal?.evidenceJson ?? "{}");
      expect(evidence.missingFields).toContain("registrationNumber");
    });
  });

  describe("MISSING_REQUIRED_DOCUMENTS", () => {
    it("triggers for customer missing ID_DOCUMENT", () => {
      const docs: RuleDocument[] = [
        { type: "PROOF_OF_ADDRESS", status: "UPLOADED" },
      ];
      const signal = evaluateMissingRequiredDocuments("cust-1", undefined, docs);
      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe("HIGH");
      const evidence = JSON.parse(signal?.evidenceJson ?? "{}");
      expect(evidence.missingDocumentTypes).toContain("ID_DOCUMENT");
    });

    it("does not trigger when customer has both required documents", () => {
      const docs: RuleDocument[] = [
        { type: "ID_DOCUMENT", status: "UPLOADED" },
        { type: "PROOF_OF_ADDRESS", status: "UPLOADED" },
      ];
      const signal = evaluateMissingRequiredDocuments("cust-1", undefined, docs);
      expect(signal).toBeNull();
    });

    it("triggers for business missing COMPANY_REGISTRATION", () => {
      const docs: RuleDocument[] = [
        { type: "BENEFICIAL_OWNERSHIP", status: "UPLOADED" },
      ];
      const signal = evaluateMissingRequiredDocuments(undefined, "bus-1", docs);
      expect(signal).not.toBeNull();
      const evidence = JSON.parse(signal?.evidenceJson ?? "{}");
      expect(evidence.missingDocumentTypes).toContain("COMPANY_REGISTRATION");
    });

    it("ignores archived documents", () => {
      const docs: RuleDocument[] = [
        { type: "ID_DOCUMENT", status: "ARCHIVED" },
        { type: "PROOF_OF_ADDRESS", status: "UPLOADED" },
      ];
      const signal = evaluateMissingRequiredDocuments("cust-1", undefined, docs);
      expect(signal).not.toBeNull();
      const evidence = JSON.parse(signal?.evidenceJson ?? "{}");
      expect(evidence.missingDocumentTypes).toContain("ID_DOCUMENT");
    });
  });
});
