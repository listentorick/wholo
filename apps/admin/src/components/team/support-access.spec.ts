import { describe, expect, it } from 'vitest';
import { endedLabel, formatMinutes, visitMinutes } from './support-access';

describe('endedLabel', () => {
  it('says how a visit ended, in the Owner’s terms', () => {
    expect(endedLabel({ status: 'ACTIVE', endedBy: null })).toBe('In your account now');
    expect(endedLabel({ status: 'EXPIRED', endedBy: null })).toBe('Time ran out');
    expect(endedLabel({ status: 'ENDED', endedBy: 'HOLDER' })).toBe('Left early');
    expect(endedLabel({ status: 'ENDED', endedBy: 'DISTRIBUTOR' })).toBe('Ended by your team');
    expect(endedLabel({ status: 'ENDED', endedBy: 'STOCDUP' })).toBe('Ended by Stocdup');
  });
});

describe('visitMinutes', () => {
  const startsAt = '2026-10-23T10:00:00Z';

  it('runs to the end time once it has passed', () => {
    expect(visitMinutes({ startsAt, expiresAt: '2026-10-23T14:00:00Z', revokedAt: null }, new Date('2026-10-23T18:00:00Z'))).toBe(240);
  });

  it('runs to when it was ended early', () => {
    expect(visitMinutes({ startsAt, expiresAt: '2026-10-23T14:00:00Z', revokedAt: '2026-10-23T10:45:00Z' }, new Date('2026-10-23T18:00:00Z'))).toBe(45);
  });

  it('counts an open visit up to now, and never goes negative', () => {
    expect(visitMinutes({ startsAt, expiresAt: '2026-10-23T14:00:00Z', revokedAt: null }, new Date('2026-10-23T11:30:00Z'))).toBe(90);
    expect(visitMinutes({ startsAt, expiresAt: '2026-10-23T14:00:00Z', revokedAt: null }, new Date('2026-10-23T09:00:00Z'))).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('reads as minutes, hours, or both', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });
});
