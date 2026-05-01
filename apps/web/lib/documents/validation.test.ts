import { describe, it, expect } from "vitest";
import { validateUpload, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from "./validation";
import { createHash } from "crypto";

function makeBuffer(size: number, fill = 0x00): Buffer {
  return Buffer.alloc(size, fill);
}

function makePdfBuffer(): Buffer {
  const buf = Buffer.alloc(1024);
  buf.write("%PDF-1.4", 0);
  return buf;
}

function makePngBuffer(): Buffer {
  const buf = Buffer.alloc(1024);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  return buf;
}

function makeJpegBuffer(): Buffer {
  const buf = Buffer.alloc(1024);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function makeTextBuffer(text: string): Buffer {
  return Buffer.from(text, "utf-8");
}

describe("file validation", () => {
  it("accepts valid PDF", () => {
    const result = validateUpload("report.pdf", "application/pdf", makePdfBuffer());
    expect(result.valid).toBe(true);
    expect(result.checksumSha256).toBeDefined();
    expect(result.checksumSha256).toHaveLength(64);
  });

  it("accepts valid PNG", () => {
    const result = validateUpload("screenshot.png", "image/png", makePngBuffer());
    expect(result.valid).toBe(true);
  });

  it("accepts valid JPEG", () => {
    const result = validateUpload("photo.jpg", "image/jpeg", makeJpegBuffer());
    expect(result.valid).toBe(true);
  });

  it("accepts valid CSV", () => {
    const result = validateUpload("data.csv", "text/csv", makeTextBuffer("a,b,c\n1,2,3"));
    expect(result.valid).toBe(true);
  });

  it("accepts valid TXT", () => {
    const result = validateUpload("notes.txt", "text/plain", makeTextBuffer("Hello world"));
    expect(result.valid).toBe(true);
  });

  it("rejects .exe", () => {
    const result = validateUpload("malware.exe", "application/octet-stream", makeBuffer(100));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("extension");
  });

  it("rejects MIME/extension mismatch", () => {
    const result = validateUpload("report.pdf", "image/png", makePdfBuffer());
    expect(result.valid).toBe(false);
    expect(result.error).toContain("MIME type");
  });

  it("rejects oversized file", () => {
    const big = makeBuffer(11 * 1024 * 1024); // 11MB
    const result = validateUpload("big.pdf", "application/pdf", big, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum size");
  });

  it("rejects PDF with wrong magic bytes", () => {
    const buf = makeBuffer(1024);
    buf.write("NOTPDF", 0);
    const result = validateUpload("fake.pdf", "application/pdf", buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File content does not match");
  });

  it("rejects PNG with wrong magic bytes", () => {
    const buf = makeBuffer(1024);
    buf.write("NOTPNG", 0);
    const result = validateUpload("fake.png", "image/png", buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File content does not match");
  });

  it("rejects JPEG with wrong magic bytes", () => {
    const buf = makeBuffer(1024);
    buf.write("NOTJPG", 0);
    const result = validateUpload("fake.jpg", "image/jpeg", buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File content does not match");
  });

  it("rejects text file with null bytes", () => {
    const buf = makeBuffer(100);
    buf[10] = 0x00;
    const result = validateUpload("fake.txt", "text/plain", buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File content does not match");
  });

  it("computes correct SHA-256", () => {
    const buf = makeTextBuffer("test content");
    const result = validateUpload("test.txt", "text/plain", buf);
    expect(result.valid).toBe(true);
    const expected = createHash("sha256").update(buf).digest("hex");
    expect(result.checksumSha256).toBe(expected);
  });

  it("rejects unknown file extension", () => {
    const result = validateUpload("file.xyz", "application/xyz", makeBuffer(100));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("extension");
  });
});

describe("allowed types constants", () => {
  it("has expected MIME types", () => {
    expect(ALLOWED_MIME_TYPES).toContain("application/pdf");
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("text/csv");
    expect(ALLOWED_MIME_TYPES).toContain("text/plain");
  });

  it("has expected extensions", () => {
    expect(ALLOWED_EXTENSIONS).toContain(".pdf");
    expect(ALLOWED_EXTENSIONS).toContain(".png");
    expect(ALLOWED_EXTENSIONS).toContain(".jpg");
    expect(ALLOWED_EXTENSIONS).toContain(".csv");
    expect(ALLOWED_EXTENSIONS).toContain(".txt");
  });
});
