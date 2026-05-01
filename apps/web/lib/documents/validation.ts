import { createHash } from "crypto";

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/csv",
  "text/plain",
];

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".csv",
  ".txt",
];

const MIME_BY_EXT: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".csv": ["text/csv", "application/csv"],
  ".txt": ["text/plain"],
};

// Magic bytes for common formats
function checkMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  // PDF: %PDF
  if (declaredMime === "application/pdf") {
    if (buffer.length < 4) return false;
    return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  }

  // PNG: 89 50 4E 47
  if (declaredMime === "image/png") {
    if (buffer.length < 4) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // JPEG: FF D8 FF
  if (declaredMime === "image/jpeg") {
    if (buffer.length < 3) return false;
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // CSV and TXT: no reliable magic bytes; accept if text-like
  if (declaredMime === "text/csv" || declaredMime === "application/csv" || declaredMime === "text/plain") {
    // Check for null bytes (binary indicator)
    for (let i = 0; i < Math.min(buffer.length, 512); i++) {
      if (buffer[i] === 0x00) return false;
    }
    return true;
  }

  return false;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  checksumSha256?: string;
}

export function validateUpload(
  fileName: string,
  declaredMimeType: string,
  fileBuffer: Buffer,
  maxSizeBytes = parseInt(process.env.MAX_DOCUMENT_UPLOAD_BYTES ?? String(DEFAULT_MAX_SIZE), 10)
): ValidationResult {
  // Size check
  if (fileBuffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${maxSizeBytes} bytes`,
    };
  }

  // Extension check
  const ext = getExtension(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File extension "${ext}" is not allowed`,
    };
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType)) {
    return {
      valid: false,
      error: `MIME type "${declaredMimeType}" is not allowed`,
    };
  }

  // Extension/MIME consistency check
  const allowedMimesForExt = MIME_BY_EXT[ext];
  if (!allowedMimesForExt || !allowedMimesForExt.includes(declaredMimeType)) {
    return {
      valid: false,
      error: `MIME type "${declaredMimeType}" does not match file extension "${ext}"`,
    };
  }

  // Magic bytes check
  if (!checkMagicBytes(fileBuffer, declaredMimeType)) {
    return {
      valid: false,
      error: `File content does not match declared format "${declaredMimeType}"`,
    };
  }

  // Compute SHA-256
  const checksum = createHash("sha256").update(fileBuffer).digest("hex");

  return { valid: true, checksumSha256: checksum };
}
