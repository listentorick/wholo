import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first character of the local part and the full domain', () => {
    expect(maskEmail('rick@example.com')).toBe('r***@example.com');
  });

  it('masks a one-character local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('splits on the last @ so nothing after the first one leaks', () => {
    expect(maskEmail('a@b@example.com')).toBe('a***@example.com');
  });

  it('never returns an unmasked value for malformed input', () => {
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('labels a missing address', () => {
    expect(maskEmail(null)).toBe('(none)');
    expect(maskEmail(undefined)).toBe('(none)');
    expect(maskEmail('')).toBe('(none)');
  });
});
