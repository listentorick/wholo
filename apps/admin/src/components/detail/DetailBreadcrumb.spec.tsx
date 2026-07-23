import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailBreadcrumb } from './DetailBreadcrumb';

describe('DetailBreadcrumb', () => {
  it('renders a link with the given label and href', () => {
    render(<DetailBreadcrumb href="/products" label="Products" />);
    const link = screen.getByRole('link', { name: /Products/ });
    expect(link).toHaveAttribute('href', '/products');
  });
});
