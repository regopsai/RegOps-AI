import { parse } from "csv-parse/sync";

export interface ParsedCsvRow {
  rowIndex: number;
  raw: Record<string, string>;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  headers: string[];
  ignoredColumns: string[];
  errors: string[];
}

const REQUIRED_COLUMNS = [
  "externalReference",
  "direction",
  "amount",
  "currency",
  "counterpartyName",
  "counterpartyAccount",
  "counterpartyCountry",
  "paymentRail",
  "transactionType",
  "description",
  "occurredAt",
];

const OPTIONAL_COLUMNS = [
  "customerExternalReference",
  "businessExternalReference",
  "complianceCaseId",
];

const ALLOWED_COLUMNS = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

export function parseTransactionCsv(buffer: Buffer): CsvParseResult {
  const text = buffer.toString("utf-8");
  const errors: string[] = [];

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { rows: [], headers: [], ignoredColumns: [], errors: [`CSV parse error: ${message}`] };
  }

  if (records.length === 0) {
    return { rows: [], headers: [], ignoredColumns: [], errors: ["CSV file is empty or has no data rows"] };
  }

  const headers = Object.keys(records[0]).map((h) => h.trim());

  // Check for unknown columns — allowed but tracked
  const ignoredColumns = headers.filter((h) => !ALLOWED_COLUMNS.has(h));

  // Check for missing required columns
  const normalizedHeaders = new Set(headers);
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !normalizedHeaders.has(c));
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const rows: ParsedCsvRow[] = records.map((raw, idx) => ({
    rowIndex: idx + 2, // 1-based with header = row 1
    raw,
  }));

  return { rows, headers, ignoredColumns, errors };
}
