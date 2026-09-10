import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverBanner } from './CoverBanner';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

describe('CoverBanner', () => {
  it('renders the banner image when a bannerUrl is set', () => {
    const { container } = render(<CoverBanner bannerUrl="https://cdn.example/b.webp" dominantColor={null} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/b.webp');
  });

  it('falls back to the gradient (using dominantColor) with no image', () => {
    const { container } = render(<CoverBanner bannerUrl={null} dominantColor="#3d6e3c" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[style*="#3d6e3c"]')).not.toBeNull();
  });

  it('sets the collapsed height on scroll (full height at the top of the page)', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    const { container } = render(<CoverBanner bannerUrl={null} dominantColor={null} />);
    const el = container.querySelector('.cover-banner') as HTMLElement;
    expect(el.style.height).toBe('300px');
  });

  it('skips the scroll collapse under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const { container } = render(<CoverBanner bannerUrl={null} dominantColor={null} />);
    const el = container.querySelector('.cover-banner') as HTMLElement;
    expect(el.style.height).toBe('');
  });
});
