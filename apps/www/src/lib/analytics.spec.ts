import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { plausible?: unknown }).plausible;
});

describe('track', () => {
  it('forwards the event and props to window.plausible', () => {
    const plausible = vi.fn();
    (window as unknown as { plausible: unknown }).plausible = plausible;

    track('form_success', { variant: 'growth' });

    expect(plausible).toHaveBeenCalledWith('form_success', { props: { variant: 'growth' } });
  });

  it('sends no props object when none are given', () => {
    const plausible = vi.fn();
    (window as unknown as { plausible: unknown }).plausible = plausible;

    track('form_start');

    expect(plausible).toHaveBeenCalledWith('form_start', undefined);
  });

  it('is a no-op (never throws) when plausible is not present', () => {
    expect(() => track('cta_click', { section: 'hero' })).not.toThrow();
  });
});
