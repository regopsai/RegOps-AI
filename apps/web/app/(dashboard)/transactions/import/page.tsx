"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TransactionImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState("SKIP_DUPLICATES");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    batchId?: string;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    failedRows?: number;
    rowErrors?: { rowIndex: number; errors: string[] }[];
    error?: string;
  } | null>(null);
  const router = useRouter();

  const sampleCsv = `externalReference,direction,amount,currency,counterpartyName,counterpartyAccount,counterpartyCountry,paymentRail,transactionType,description,occurredAt,customerExternalReference
TXN-001,INBOUND,5000.00,USD,Alice Smith,ACC-123,US,SEPA,TRANSFER,Salary payment,2024-01-15T10:00:00Z,CUST-001
TXN-002,OUTBOUND,2500.00,USD,Bob Jones,ACC-456,GB,SWIFT,TRANSFER,Invoice payment,2024-01-16T14:30:00Z,CUST-001`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Import failed" });
      } else {
        setResult(data);
        router.refresh();
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import Transactions</h1>
        <button
          onClick={() => router.push("/transactions")}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to transactions
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Required CSV Format</h2>
        <p className="mt-1 text-xs text-slate-500">
          Columns: externalReference, direction, amount, currency, counterpartyName,
          counterpartyAccount, counterpartyCountry, paymentRail, transactionType, description,
          occurredAt
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Optional link columns: customerExternalReference, businessExternalReference, complianceCaseId
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
          {sampleCsv}
        </pre>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Import Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="SKIP_DUPLICATES">Skip duplicates</option>
            <option value="FAIL_ON_DUPLICATES">Fail on duplicates</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? "Importing..." : "Import"}
        </button>
      </form>

      {result && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {result.error ? (
            <p className="text-sm font-medium text-red-600">{result.error}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-700">Import completed</p>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="font-semibold">{result.totalRows}</div>
                </div>
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-xs text-slate-500">Imported</div>
                  <div className="font-semibold text-green-700">{result.importedRows}</div>
                </div>
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-xs text-slate-500">Skipped</div>
                  <div className="font-semibold text-yellow-700">{result.skippedRows}</div>
                </div>
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-xs text-slate-500">Failed</div>
                  <div className="font-semibold text-red-700">{result.failedRows}</div>
                </div>
              </div>
              {result.rowErrors && result.rowErrors.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto">
                  <p className="text-xs font-medium text-slate-700">Row errors:</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {result.rowErrors.map((err) => (
                      <li key={err.rowIndex} className="text-red-600">
                        Row {err.rowIndex}: {err.errors.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
