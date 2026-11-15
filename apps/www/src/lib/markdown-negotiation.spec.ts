import { describe, expect, it } from 'vitest';
import { prefersMarkdown } from './markdown-negotiation';

describe('prefersMarkdown', () => {
  it.each([
    ['text/markdown'],
    ['text/markdown, text/html'],
    ['text/html;q=0.8, text/markdown'],
    ['TEXT/MARKDOWN; charset=utf-8'],
    ['text/markdown;q=0.9, text/html;q=0.9'],
  ])('is true for %j', (accept) => {
    expect(prefersMarkdown(accept)).toBe(true);
  });

  it.each([
    [null],
    [''],
    ['*/*'],
    ['text/*'],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    ['text/html, text/markdown;q=0.5'],
    ['text/markdown;q=0'],
    ['text/plain'],
  ])('is false for %j', (accept) => {
    expect(prefersMarkdown(accept)).toBe(false);
  });
});
