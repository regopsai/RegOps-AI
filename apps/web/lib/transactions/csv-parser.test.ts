import { describe, it, expect } from "vitest";
import { parseTransactionCsv } from "./csv-parser";

function makeCsv(rows: string[]): Buffer {
  return Buffer.from(rows.join("\n"));
}

describe("parseTransactionCsv", () => {
  it("accepts valid CSV with all required columns", () => {
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt",
      "TXN-001,INBOUND,100.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-01T00:00:00Z",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].raw.externalReference).toBe("TXN-001");
  });

  it("rejects missing required columns", () => {
    const csv = makeCsv([
      "externalReference,direction,amount",
      "TXN-001,INBOUND,100.00",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Missing required columns");
  });

  it("allows unknown columns and tracks them in ignoredColumns", () => {
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,unknownColumn",
      "TXN-001,INBOUND,100.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-01T00:00:00Z,value",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.ignoredColumns).toContain("unknownColumn");
    expect(result.rows).toHaveLength(1);
  });

  it("handles extra columns safely with mixed optional and unknown", () => {
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference,extraCol",
      "TXN-001,INBOUND,100.00,USD,Alice,ACC-1,US,SEPA,TRANSFER,Payment,2024-01-01T00:00:00Z,CUST-001,ignored",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.ignoredColumns).toContain("extraCol");
    expect(result.ignoredColumns).not.toContain("customerExternalReference");
    expect(result.rows).toHaveLength(1);
  });

  it("trims headers and values", () => {
    const csv = makeCsv([
      " externalReference , direction , amount , currency , counterpartyName , counterpartyAccount , counterpartyCountry , paymentRail , transactionType , description , occurredAt ",
      " TXN-001 , INBOUND , 100.00 , USD , Alice , ACC-1 , US , SEPA , TRANSFER , Payment , 2024-01-01T00:00:00Z ",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].raw.externalReference).toBe("TXN-001");
  });

  it("rejects empty CSV", () => {
    const result = parseTransactionCsv(Buffer.from(""));
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects CSV with only headers", () => {
    const csv = makeCsv([
      "externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt",
    ]);
    const result = parseTransactionCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("empty");
  });
});
