"use client";

import { useState } from "react";

interface DocumentItem {
  id: string;
  originalFileName: string;
  type: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date | string;
  uploadedBy: { name: string | null; email: string } | null;
  checksumSha256: string | null;
  extractedText: string | null;
}

export function DocumentList({
  documents,
  canArchive,
  onArchive,
}: {
  documents: DocumentItem[];
  canArchive: boolean;
  onArchive?: () => void;
}) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const handleArchive = async (docId: string) => {
    setArchivingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/archive`, { method: "POST" });
      if (res.ok) {
        onArchive?.();
      }
    } finally {
      setArchivingId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (documents.length === 0) {
    return <p className="text-sm text-slate-500">No documents.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {documents.map((d) => (
        <li key={d.id} className="py-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{d.originalFileName}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {d.type}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {d.status}
              </span>
              <span className="text-xs text-slate-500">{formatSize(d.sizeBytes)}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/documents/${d.id}/download`}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Download
              </a>
              {canArchive && d.status !== "ARCHIVED" && (
                <button
                  onClick={() => handleArchive(d.id)}
                  disabled={archivingId === d.id}
                  className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {archivingId === d.id ? "Archiving..." : "Archive"}
                </button>
              )}
              {d.extractedText && (
                <button
                  onClick={() =>
                    setViewingId(viewingId === d.id ? null : d.id)
                  }
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  {viewingId === d.id ? "Hide" : "Preview"}
                </button>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Uploaded by {d.uploadedBy?.name ?? d.uploadedBy?.email ?? "unknown"} on{" "}
            {new Date(d.createdAt).toLocaleDateString()}
            {d.checksumSha256 && (
              <span className="ml-2 font-mono text-[10px]">
                SHA-256: {d.checksumSha256.slice(0, 16)}...
              </span>
            )}
          </p>
          {viewingId === d.id && d.extractedText && (
            <div className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2">
              <pre className="whitespace-pre-wrap text-xs text-slate-700">{d.extractedText}</pre>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
