import { env } from '../config/env';

// Tika can take a while on large PDFs. 60s is generous but safe.
const TIKA_TIMEOUT_MS = 60_000;

/**
 * Sends raw bytes to Apache Tika and returns extracted plain text.
 * Tika auto-detects the format from the Content-Type header (and from
 * the file magic bytes as a fallback), so callers don't need to know
 * which parser to invoke.
 *
 * Throws on:
 *  - HTTP error from Tika
 *  - Timeout (60s)
 *  - Empty response (Tika can return 200 with empty body for unparseable files)
 */
export async function extractText(
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIKA_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.TIKA_URL}/tika`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        Accept: 'text/plain',
      },
      body: new Uint8Array(buffer),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Tika extraction failed (${response.status}): ${errorBody.slice(0, 200)}`
      );
    }

    const text = await response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Tika returned empty text — file may be corrupt or unsupported');
    }

    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Tika extraction timed out after 60s');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}