import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Acme Wines')).toBe('acme-wines');
  });

  it('collapses punctuation and whitespace runs into single hyphens', () => {
    expect(slugify('Vine & Co.  Ltd')).toBe('vine-co-ltd');
  });

  it('strips diacritics', () => {
    expect(slugify('Château Léoube')).toBe('chateau-leoube');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Acme--  ')).toBe('acme');
  });

  it('caps length at 60 characters without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(59) + ' bcd');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back to "distributor" when nothing survives', () => {
    expect(slugify('!!!')).toBe('distributor');
    expect(slugify('')).toBe('distributor');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free', () => {
    expect(uniqueSlug('acme', new Set())).toBe('acme');
  });

  it('appends -2 when the base is taken', () => {
    expect(uniqueSlug('acme', new Set(['acme']))).toBe('acme-2');
  });

  it('picks the lowest free suffix', () => {
    expect(uniqueSlug('acme', new Set(['acme', 'acme-2', 'acme-3']))).toBe('acme-4');
  });
});
