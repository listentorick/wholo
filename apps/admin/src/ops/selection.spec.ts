import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSelection, dismissEndedVisit, endSelection, getEndedVisit, getSelection, profileMatchesSelection, selectionHeaders, setSelection,
  type WholesalerSelection,
} from './selection';

const vine: WholesalerSelection = { distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: '2026-10-23T16:00:00Z', reason: 'Price lists' };

describe('wholesaler selection', () => {
  afterEach(() => {
    clearSelection();
    dismissEndedVisit();
  });

  it('sends no organisation header until a wholesaler is selected', () => {
    expect(selectionHeaders()).toEqual({});
    setSelection(vine);
    expect(selectionHeaders()).toEqual({ 'X-Organisation-Id': 'dist-1' });
  });

  it('is kept per tab (sessionStorage), not shared across tabs', () => {
    setSelection(vine);
    expect(window.sessionStorage.getItem('stocdup.ops.selection')).toContain('dist-1');
    expect(window.localStorage.getItem('stocdup.ops.selection')).toBeNull();
  });

  it('remembers why the visit ended, and clears the selection', () => {
    setSelection(vine);
    const ended = endSelection('REVOKED', new Date('2026-10-23T13:00:00Z'));
    expect(getSelection()).toBeNull();
    expect(ended).toEqual({ name: 'Vine & Co', distributorId: 'dist-1', reason: 'Price lists', cause: 'REVOKED', endedAt: '2026-10-23T13:00:00.000Z' });
    expect(getEndedVisit()).toEqual(ended);
  });

  it('forgets an ended visit when a new wholesaler is opened', () => {
    setSelection(vine);
    endSelection('EXPIRED');
    setSelection({ ...vine, distributorId: 'dist-2', name: 'Harbour Cellars' });
    expect(getEndedVisit()).toBeNull();
  });

  it('survives unreadable storage', () => {
    window.sessionStorage.setItem('stocdup.ops.selection', '{not json');
    expect(getSelection()).toBeNull();
  });
});

describe('profileMatchesSelection', () => {
  const support = { kind: 'SUPPORT', grantId: 'g-1', expiresAt: vine.expiresAt } as const;

  it('accepts the selected wholesaler reached through support access', () => {
    expect(profileMatchesSelection({ organisationId: 'dist-1', access: support }, vine)).toBe(true);
  });

  it('rejects another organisation or a membership', () => {
    expect(profileMatchesSelection({ organisationId: 'dist-2', access: support }, vine)).toBe(false);
    expect(profileMatchesSelection({ organisationId: 'dist-1', access: { kind: 'MEMBER' } }, vine)).toBe(false);
  });
});
