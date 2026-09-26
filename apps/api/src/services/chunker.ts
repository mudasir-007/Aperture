import { env } from '../config/env';

/**
 * Recursive-ish chunker: splits on paragraph boundaries first, then on
 * sentence boundaries, packing content up to CHUNK_SIZE_CHARS with
 * CHUNK_OVERLAP_CHARS of trailing overlap carried into the next chunk so
 * context isn't lost at a boundary. This is the MVP's stand-in for the
 * full structure-aware (table/heading-preserving) chunker described in
 * docs/architecture.md Section 4.3 -- swapping in Docling-based
 * table/heading detection later means replacing this module only.
 */
export function chunkText(
  text: string,
  options: { chunkSize?: number; overlap?: number } = {}
): string[] {
  const chunkSize = options.chunkSize ?? env.CHUNK_SIZE_CHARS;
  const overlap = options.overlap ?? env.CHUNK_OVERLAP_CHARS;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      // Paragraph itself is too big -- split on sentences.
      const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [paragraph];
      for (const sentence of sentences) {
        if ((current + sentence).length > chunkSize) {
          flush();
          current = current.slice(Math.max(0, current.length - overlap)) + sentence;
        } else {
          current += sentence;
        }
      }
      continue;
    }

    if ((current + '\n\n' + paragraph).length > chunkSize) {
      flush();
      const overlapTail = current.slice(Math.max(0, current.length - overlap));
      current = overlapTail ? `${overlapTail}\n\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  flush();

  return chunks;
}
