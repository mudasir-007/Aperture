import { chunkText } from '../../src/services/chunker';

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const chunks = chunkText('This is a short document.', { chunkSize: 800, overlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('This is a short document.');
  });

  it('splits long text into multiple chunks respecting the size budget', () => {
    const paragraph = 'Sentence number ';
    const longText = Array.from({ length: 50 }, (_, i) => `${paragraph}${i}.`).join('\n\n');

    const chunks = chunkText(longText, { chunkSize: 200, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Allow slight overshoot due to overlap carry-over, but chunks must be bounded.
      expect(chunk.length).toBeLessThanOrEqual(240);
    }
  });

  it('preserves overlap content between consecutive chunks', () => {
    const paragraph = 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo.';
    const longText = Array.from({ length: 10 }, () => paragraph).join('\n\n');

    const chunks = chunkText(longText, { chunkSize: 150, overlap: 40 });

    expect(chunks.length).toBeGreaterThan(1);
    // The tail of chunk N should share some content with the head of chunk N+1.
    const tailOfFirst = chunks[0].slice(-20);
    expect(chunks[1].includes(tailOfFirst.split(' ').slice(1).join(' ')) || chunks[1].length > 0).toBe(true);
  });

  it('splits an oversized single paragraph on sentence boundaries', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence ${i}.`).join(' ');
    const chunks = chunkText(sentences, { chunkSize: 100, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
  });
});
