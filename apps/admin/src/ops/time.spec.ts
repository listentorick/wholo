import { describe, expect, it } from 'vitest';
import { formatDuration, minutesLeft } from './time';

describe('minutesLeft', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('rounds part of a minute up, so "0m left" means it has ended', () => {
    expect(minutesLeft('2026-10-23T12:10:00Z', now)).toBe(10);
    expect(minutesLeft('2026-10-23T12:00:30Z', now)).toBe(1);
  });

  it('never goes negative', () => {
    expect(minutesLeft('2026-10-23T11:00:00Z', now)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('reads as minutes, hours, or both', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(180)).toBe('3h');
    expect(formatDuration(200)).toBe('3h 20m');
  });
});
