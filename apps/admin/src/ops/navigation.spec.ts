import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endedCause, enterWholesaler, leaveWholesaler } from './navigation';
import { clearSelection, dismissEndedVisit, getEndedVisit, getSelection, setSelection } from './selection';

const vine = { distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: '2026-10-23T14:00:00Z', reason: 'Price lists' };

describe('Ops navigation', () => {
  const assign = vi.fn();
  const location = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, assign } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: location });
    clearSelection();
    dismissEndedVisit();
    vi.clearAllMocks();
  });

  it('enters a wholesaler by selecting it for this tab and reloading at its dashboard', () => {
    enterWholesaler({ id: 'g-1', distributorId: 'dist-1', distributorName: 'Vine & Co', expiresAt: vine.expiresAt, reason: 'Price lists' });
    expect(getSelection()).toEqual(vine);
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('leaves by dropping the selection, remembering why, and reloading at /ops', () => {
    setSelection(vine);
    leaveWholesaler('LEFT');
    expect(getSelection()).toBeNull();
    expect(getEndedVisit()).toMatchObject({ name: 'Vine & Co', cause: 'LEFT' });
    expect(assign).toHaveBeenCalledWith('/ops');
  });

  it('calls a refusal expired once the end time has passed, otherwise ended early', () => {
    setSelection(vine);
    expect(endedCause(new Date('2026-10-23T14:00:00Z'))).toBe('EXPIRED');
    expect(endedCause(new Date('2026-10-23T13:00:00Z'))).toBe('REVOKED');
  });
});
