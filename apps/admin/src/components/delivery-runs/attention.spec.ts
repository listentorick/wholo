import { describe, it, expect } from 'vitest';
import {
  unallocatedReasonCopy, totalsCopy, lineItemsCopy, missedCopy,
} from './attention';

describe('unallocatedReasonCopy', () => {
  it('maps NO_ROUTE to its copy', () => {
    expect(unallocatedReasonCopy('NO_ROUTE')).toBe('No delivery route');
  });

  it('maps RUN_READY to its copy', () => {
    expect(unallocatedReasonCopy('RUN_READY')).toBe('Run already marked ready');
  });

  it('maps a null reason to "Ready to assign"', () => {
    expect(unallocatedReasonCopy(null)).toBe('Ready to assign');
  });
});

describe('totalsCopy', () => {
  it('pluralizes stops and items', () => {
    expect(totalsCopy(6, 118)).toBe('6 stops · 118 items');
  });

  it('uses singular for exactly one stop and one item', () => {
    expect(totalsCopy(1, 1)).toBe('1 stop · 1 item');
  });

  it('never says "cases"', () => {
    expect(totalsCopy(4, 22)).not.toMatch(/case/i);
  });
});

describe('lineItemsCopy', () => {
  it('formats as "N lines · M items"', () => {
    expect(lineItemsCopy(4, 22)).toBe('4 lines · 22 items');
  });

  it('uses singular for exactly one line', () => {
    expect(lineItemsCopy(1, 3)).toBe('1 line · 3 items');
  });
});

describe('missedCopy', () => {
  it('reads "Missed — was due <date>"', () => {
    expect(missedCopy('2026-08-12')).toBe('Missed — was due 12 Aug');
  });
});
