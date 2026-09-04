import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'not-a-real-supplier' }),
}));

import DistributorNotFound from './not-found';

describe('DistributorNotFound', () => {
  it('names the attempted slug and offers a way back to the supplier list', () => {
    render(<DistributorNotFound />);

    expect(screen.getByText(/We can.t find that/)).toBeTruthy();
    expect(screen.getByText('supplier')).toBeTruthy();
    expect(screen.getByText('/not-a-real-supplier')).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Go to Your Suppliers' });
    expect(link.getAttribute('href')).toBe('/');
  });
});
