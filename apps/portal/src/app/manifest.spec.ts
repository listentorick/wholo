import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('produces an installable standalone manifest scoped to this app', () => {
    const result = manifest();

    expect(result.name).toBe('Stocdup');
    expect(result.short_name).toBe('Stocdup');
    expect(result.display).toBe('standalone');
    expect(result.start_url).toBe('/');
    expect(result.scope).toBe('/');
    expect(result.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(result.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
  });
});
