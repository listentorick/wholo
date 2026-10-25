import { describe, expect, it } from 'vitest';
import { opsTitle } from './title';

describe('opsTitle', () => {
  it('names the wholesaler inside one', () => {
    expect(opsTitle('Vine & Co', 'Price lists')).toBe('OPS · Vine & Co · Price lists');
    expect(opsTitle('Vine & Co')).toBe('OPS · Vine & Co');
  });

  it('says Stocdup Ops on the Ops pages', () => {
    expect(opsTitle(null, 'Wholesalers')).toBe('Stocdup Ops · Wholesalers');
    expect(opsTitle(null)).toBe('Stocdup Ops');
  });
});
