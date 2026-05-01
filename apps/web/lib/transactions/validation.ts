

export interface ValidatedTransactionRow {
  rowIndex: number;
  externalReference: string;
  direction: "INBOUND" | "OUTBOUND";
  amount: number;
  currency: string;
  counterpartyName: string;
  counterpartyAccount: string;
  counterpartyCountry: string;
  paymentRail: string;
  transactionType: string;
  description: string;
  occurredAt: Date;
  customerExternalReference?: string;
  businessExternalReference?: string;
  complianceCaseId?: string;
}

export interface RowValidationError {
  rowIndex: number;
  errors: string[];
}

function isValidDate(value: string): Date | null {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function isPositiveDecimal(value: string): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

export function validateTransactionRow(
  row: { rowIndex: number; raw: Record<string, string> }
): { valid: true; data: ValidatedTransactionRow } | { valid: false; errors: string[] } {
  const raw = row.raw;
  const errors: string[] = [];

  const externalReference = raw.externalReference?.trim();
  if (!externalReference) errors.push("externalReference is required");

  const directionRaw = raw.direction?.trim().toUpperCase();
  if (directionRaw !== "INBOUND" && directionRaw !== "OUTBOUND") {
    errors.push("direction must be INBOUND or OUTBOUND");
  }

  const amount = raw.amount?.trim();
  const amountNum = amount ? isPositiveDecimal(amount) : null;
  if (!amountNum) errors.push("amount must be a positive decimal");

  const currency = raw.currency?.trim().toUpperCase();
  if (!currency || currency.length !== 3 || !/^[A-Z]{3}$/.test(currency)) {
    errors.push("currency must be a 3-letter uppercase code");
  }

  const occurredAt = raw.occurredAt?.trim();
  const occurredDate = occurredAt ? isValidDate(occurredAt) : null;
  if (!occurredDate) errors.push("occurredAt must be a valid date/time");

  const customerExternalReference = raw.customerExternalReference?.trim() || undefined;
  const businessExternalReference = raw.businessExternalReference?.trim() || undefined;
  const complianceCaseId = raw.complianceCaseId?.trim() || undefined;

  if (!customerExternalReference && !businessExternalReference && !complianceCaseId) {
    errors.push("At least one link is required: customerExternalReference, businessExternalReference, or complianceCaseId");
  }

  if (customerExternalReference && businessExternalReference) {
    errors.push("Cannot link to both customer and business in the same row");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      rowIndex: row.rowIndex,
      externalReference: externalReference!,
      direction: directionRaw as "INBOUND" | "OUTBOUND",
      amount: amountNum!,
      currency: currency!,
      counterpartyName: raw.counterpartyName?.trim() ?? "",
      counterpartyAccount: raw.counterpartyAccount?.trim() ?? "",
      counterpartyCountry: raw.counterpartyCountry?.trim().toUpperCase() ?? "",
      paymentRail: raw.paymentRail?.trim() ?? "",
      transactionType: raw.transactionType?.trim() ?? "",
      description: raw.description?.trim() ?? "",
      occurredAt: occurredDate!,
      customerExternalReference,
      businessExternalReference,
      complianceCaseId,
    },
  };
}
