import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DistributorHeader } from './DistributorHeader';

let mockDistributor: { name: string; logoUrl: string | null } | null = null;

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: () => ({ distributor: mockDistributor }),
}));

const slug = 'test-distributor';

function renderHeader() {
  return render(<DistributorHeader distributorSlug={slug} />);
}

describe('DistributorHeader', () => {
  beforeEach(() => {
    mockDistributor = null;
  });

  it('shows distributor name', () => {
    mockDistributor = { name: 'Fine Wines Ltd', logoUrl: null };
    renderHeader();
    expect(screen.getByText('Fine Wines Ltd')).toBeTruthy();
  });

  it('falls back to slug when distributor not loaded', () => {
    mockDistributor = null;
    renderHeader();
    expect(screen.getByText(slug)).toBeTruthy();
  });

  it('renders distributor logo when logoUrl is provided', () => {
    mockDistributor = { name: 'Winos', logoUrl: 'https://example.com/logo.png' };
    const { container } = renderHeader();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
  });
});
