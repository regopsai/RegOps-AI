import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractionResult {
  extractedText: string | null;
  status: "EXTRACTED" | "UNSUPPORTED" | "FAILED";
  metadataJson: string;
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const data = new Uint8Array(buffer);
  const pdf = await getDocument({ data }).promise;
  const numPages = pdf.numPages;
  const texts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if (typeof item === "object" && item !== null && "str" in item) {
          return (item as { str: string }).str;
        }
        return "";
      })
      .join(" ");
    texts.push(pageText);
  }

  await pdf.destroy();
  return { text: texts.join("\n").trim(), pages: numPages };
}

export async function extractDocumentText(
  mimeType: string,
  buffer: Buffer
): Promise<ExtractionResult> {
  try {
    if (mimeType === "application/pdf") {
      const data = await extractPdfText(buffer);
      return {
        extractedText: data.text || null,
        status: "EXTRACTED",
        metadataJson: JSON.stringify({
          source: "pdfjs-dist",
          pages: data.pages,
        }),
      };
    }

    if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "application/csv") {
      const text = buffer.toString("utf-8");
      return {
        extractedText: text,
        status: "EXTRACTED",
        metadataJson: JSON.stringify({
          source: "utf-8-text",
          charCount: text.length,
          lineCount: text.split("\n").length,
        }),
      };
    }

    if (mimeType.startsWith("image/")) {
      return {
        extractedText: null,
        status: "UNSUPPORTED",
        metadataJson: JSON.stringify({
          source: "none",
          reason: "OCR not implemented in this phase",
          mimeType,
        }),
      };
    }

    return {
      extractedText: null,
      status: "UNSUPPORTED",
      metadataJson: JSON.stringify({
        source: "none",
        reason: "Unsupported MIME type for extraction",
        mimeType,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      extractedText: null,
      status: "FAILED",
      metadataJson: JSON.stringify({
        source: "extraction-error",
        error: message,
        mimeType,
      }),
    };
  }
}
