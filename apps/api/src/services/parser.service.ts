const SUPPORTED_TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(
      `Unsupported file type "${mimeType}". This MVP ingestion pipeline supports plain text ` +
        'and Markdown (.txt, .md). See docs/architecture.md Section 4.2: this function is the ' +
        'single seam where an Apache Tika / Docling / pdf-parse normalization step would plug in ' +
        'for PDF, DOCX, image, and other formats without changing any other part of the pipeline.'
    );
  }
}

/**
 * Format-normalization stage ("one clean interface" in docs/architecture.md
 * Section 4.2). Currently handles plain text formats directly. Adding a new
 * format means adding a branch here (or delegating to an external
 * parser/OCR service) -- callers (ingestion.service.ts) are unaffected.
 */
export function parseDocumentToText(buffer: Buffer, mimeType: string): string {
  if (!SUPPORTED_TEXT_MIME_TYPES.has(mimeType)) {
    throw new UnsupportedFileTypeError(mimeType);
  }
  return buffer.toString('utf-8');
}
