import { similarity } from './name-similarity.util';

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('Acme Wines Ltd', 'Acme Wines Ltd')).toBe(1);
  });

  it('is case-insensitive and ignores punctuation/whitespace differences', () => {
    expect(similarity('Acme Wines Ltd.', 'acme   wines ltd')).toBe(1);
  });

  it('returns 1 when both strings are empty', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('returns 0 when only one string is empty', () => {
    expect(similarity('Acme Wines', '')).toBe(0);
  });

  it('returns a mid-range score for a near-miss', () => {
    const score = similarity('Acme Wines Ltd', 'Acme Wine Ltd');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
  });

  it('returns a low score for unrelated strings', () => {
    const score = similarity('Acme Wines Ltd', 'Blackbird Vine & Co');
    expect(score).toBeLessThan(0.5);
  });
});
