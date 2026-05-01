import { describe, it, expect } from "vitest";
import { extractDocumentText } from "./extraction";

describe("extractDocumentText", () => {
  it("extracts plain text from TXT", async () => {
    const result = await extractDocumentText("text/plain", Buffer.from("hello world"));
    expect(result.status).toBe("EXTRACTED");
    expect(result.extractedText).toBe("hello world");
    const meta = JSON.parse(result.metadataJson);
    expect(meta.source).toBe("utf-8-text");
    expect(meta.charCount).toBe(11);
  });

  it("extracts plain text from CSV", async () => {
    const content = "a,b,c\n1,2,3";
    const result = await extractDocumentText("text/csv", Buffer.from(content));
    expect(result.status).toBe("EXTRACTED");
    expect(result.extractedText).toBe(content);
    const meta = JSON.parse(result.metadataJson);
    expect(meta.source).toBe("utf-8-text");
    expect(meta.lineCount).toBe(2);
  });

  it("extracts plain text from application/csv", async () => {
    const result = await extractDocumentText("application/csv", Buffer.from("x,y"));
    expect(result.status).toBe("EXTRACTED");
    expect(result.extractedText).toBe("x,y");
  });

  it("marks PNG as unsupported with OCR reason", async () => {
    const result = await extractDocumentText("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.extractedText).toBeNull();
    const meta = JSON.parse(result.metadataJson);
    expect(meta.reason).toBe("OCR not implemented in this phase");
  });

  it("marks JPEG as unsupported with OCR reason", async () => {
    const result = await extractDocumentText("image/jpeg", Buffer.from([0xff, 0xd8, 0xff]));
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.extractedText).toBeNull();
    const meta = JSON.parse(result.metadataJson);
    expect(meta.reason).toBe("OCR not implemented in this phase");
  });

  it("marks unknown MIME type as unsupported", async () => {
    const result = await extractDocumentText("application/zip", Buffer.from("PK"));
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.extractedText).toBeNull();
    const meta = JSON.parse(result.metadataJson);
    expect(meta.reason).toBe("Unsupported MIME type for extraction");
  });

  it("returns FAILED when PDF parsing throws", async () => {
    const result = await extractDocumentText("application/pdf", Buffer.from("%PDF-1.4\n"));
    expect(result.status).toBe("FAILED");
    expect(result.extractedText).toBeNull();
    const meta = JSON.parse(result.metadataJson);
    expect(meta.source).toBe("extraction-error");
    expect(meta.error).toBeDefined();
  });

  it("does not include extracted text in metadata", async () => {
    const result = await extractDocumentText("text/plain", Buffer.from("secret"));
    const meta = JSON.parse(result.metadataJson);
    expect(meta.extractedText).toBeUndefined();
  });
});
