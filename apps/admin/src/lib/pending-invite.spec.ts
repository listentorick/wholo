import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPendingInviteToken, getPendingInviteToken, setPendingInviteToken } from './pending-invite';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('pending invite token', () => {
  it('survives the round trip and can be cleared', () => {
    expect(getPendingInviteToken()).toBeNull();
    setPendingInviteToken('abc');
    expect(getPendingInviteToken()).toBe('abc');
    clearPendingInviteToken();
    expect(getPendingInviteToken()).toBeNull();
  });

  it('degrades to "no token" instead of throwing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(() => setPendingInviteToken('abc')).not.toThrow();
    expect(getPendingInviteToken()).toBeNull();
    expect(() => clearPendingInviteToken()).not.toThrow();
  });
});
