import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/server/get-distributor', () => ({
  getDistributorForSlug: vi.fn(),
}));

vi.mock('./DistributorShell', () => ({
  DistributorShell: ({
    distributorSlug,
    initialDistributor,
    children,
  }: {
    distributorSlug: string;
    initialDistributor: { name: string };
    children: React.ReactNode;
  }) => (
    <div data-testid="shell" data-slug={distributorSlug} data-name={initialDistributor?.name}>
      {children}
    </div>
  ),
}));

import { notFound } from 'next/navigation';
import { getDistributorForSlug } from '@/lib/server/get-distributor';
import DistributorLayout from './layout';

describe('DistributorLayout (server) — slug resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the client shell with the resolved distributor when the slug exists', async () => {
    vi.mocked(getDistributorForSlug).mockResolvedValue({ id: 'd1', name: 'Test Dist' } as any);

    const element = await DistributorLayout({
      children: <div>content</div>,
      params: Promise.resolve({ distributorSlug: 'test-dist' }),
    });
    render(element);

    expect(getDistributorForSlug).toHaveBeenCalledWith('test-dist');
    expect(screen.getByTestId('shell').getAttribute('data-slug')).toBe('test-dist');
    expect(screen.getByTestId('shell').getAttribute('data-name')).toBe('Test Dist');
    expect(screen.getByText('content')).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('calls notFound() before rendering anything when the slug does not resolve', async () => {
    vi.mocked(getDistributorForSlug).mockResolvedValue(null);

    await expect(
      DistributorLayout({
        children: <div>content</div>,
        params: Promise.resolve({ distributorSlug: 'bad-slug' }),
      }),
    ).rejects.toThrow();

    expect(getDistributorForSlug).toHaveBeenCalledWith('bad-slug');
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
