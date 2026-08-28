import { describe, it, expect } from 'vitest';
import { formatProcessingDays } from './format-processing-days';

describe('formatProcessingDays', () => {
  it('returns null for empty / nullish input', () => {
    expect(formatProcessingDays([])).toBeNull();
    expect(formatProcessingDays(null)).toBeNull();
    expect(formatProcessingDays(undefined)).toBeNull();
  });

  it('labels the Mon–Fri default as a range', () => {
    expect(formatProcessingDays([1, 2, 3, 4, 5])).toBe('Monday–Friday');
  });

  it('is order-independent', () => {
    expect(formatProcessingDays([5, 1, 3, 2, 4])).toBe('Monday–Friday');
  });

  it('names a single day in full', () => {
    expect(formatProcessingDays([3])).toBe('Wednesday');
  });

  it('collapses all seven days to "Every day"', () => {
    expect(formatProcessingDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
  });

  it('renders a contiguous run through the weekend', () => {
    expect(formatProcessingDays([4, 5, 6])).toBe('Thursday–Saturday');
  });

  it('lists non-contiguous days with short names, Monday first', () => {
    expect(formatProcessingDays([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(formatProcessingDays([1, 2, 4, 5])).toBe('Mon, Tue, Thu, Fri');
  });

  it('treats Sat–Sun as a contiguous weekend run', () => {
    expect(formatProcessingDays([0, 6])).toBe('Saturday–Sunday');
  });
});
