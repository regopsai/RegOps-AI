"use client";

import { useState } from "react";

export function DocumentUpload({
  entityType,
  entityId,
  onUpload,
}: {
  entityType: "case" | "customer" | "business";
  entityId: string;
  onUpload?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("OTHER");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", docType);
    if (entityType === "case") formData.append("complianceCaseId", entityId);
    if (entityType === "customer") formData.append("customerProfileId", entityId);
    if (entityType === "business") formData.append("businessProfileId", entityId);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
      } else {
        setSuccess(true);
        setFile(null);
        onUpload?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="ID_DOCUMENT">ID Document</option>
          <option value="PROOF_OF_ADDRESS">Proof of Address</option>
          <option value="COMPANY_REGISTRATION">Company Registration</option>
          <option value="BENEFICIAL_OWNERSHIP">Beneficial Ownership</option>
          <option value="BANK_STATEMENT">Bank Statement</option>
          <option value="TRANSACTION_CSV">Transaction CSV</option>
          <option value="COMPLIANCE_POLICY">Compliance Policy</option>
          <option value="OTHER">Other</option>
        </select>
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">Upload successful</p>}
    </form>
  );
}
