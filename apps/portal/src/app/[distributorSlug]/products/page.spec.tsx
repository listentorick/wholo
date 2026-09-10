import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos' }),
  useRouter: () => ({ replace: mockReplace }),
}));

import ProductsRedirect from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsRedirect', () => {
  it('redirects to the storefront catalogue anchor', () => {
    render(<ProductsRedirect />);
    expect(mockReplace).toHaveBeenCalledWith('/winos#catalogue');
  });

  it('shows a spinner, not a product grid', () => {
    render(<ProductsRedirect />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
