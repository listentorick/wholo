import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandingBanner } from './BrandingBanner';

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  const MockIntersectionObserver = vi.fn(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  }));
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

describe('BrandingBanner', () => {
  it('renders the gradient layer always', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const gradient = container.querySelector('[style*="linear-gradient"]');
    expect(gradient).not.toBeNull();
  });

  it('uses dominantColor as gradient start when provided', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor="#3d6e3c" onScrolledPast={vi.fn()} />,
    );
    const gradient = container.querySelector('[style*="#3d6e3c"]');
    expect(gradient).not.toBeNull();
  });

  it('falls back to default gradient when no dominantColor', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const gradient = container.querySelector('[style*="#e8ddd0"]');
    expect(gradient).not.toBeNull();
  });

  it('renders banner image on top when bannerUrl is set', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl="https://cdn.example.com/banner.webp" dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const img = container.querySelector('img.absolute') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('banner.webp');
  });

  it('renders logo when logoUrl is set', () => {
    render(
      <BrandingBanner logoUrl="https://cdn.example.com/logo.webp" bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const logo = imgs.find((img) => img.src.includes('logo.webp'));
    expect(logo).toBeDefined();
  });

  it('renders plain circle placeholder when no logoUrl', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const circle = container.querySelector('.logo-circle');
    expect(circle).not.toBeNull();
    const img = circle?.querySelector('img');
    expect(img).toBeNull();
  });

  it('reserves space below the banner for the hanging logo circle when logoUrl is set', () => {
    const { container } = render(
      <BrandingBanner logoUrl="https://cdn.example.com/logo.webp" bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const banner = container.querySelector('.home-banner') as HTMLElement;
    expect(banner.style.marginBottom).toBe('44px');
  });

  it('reserves no extra space when there is no logo', () => {
    const { container } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    const banner = container.querySelector('.home-banner') as HTMLElement;
    expect(banner.style.marginBottom).toBe('');
  });

  it('registers an IntersectionObserver on mount', () => {
    render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    expect(mockObserve).toHaveBeenCalledTimes(1);
  });

  it('disconnects IntersectionObserver on unmount', () => {
    const { unmount } = render(
      <BrandingBanner logoUrl={null} bannerUrl={null} dominantColor={null} onScrolledPast={vi.fn()} />,
    );
    unmount();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
