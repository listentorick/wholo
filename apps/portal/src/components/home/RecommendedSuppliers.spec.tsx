import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecommendedSuppliers } from './RecommendedSuppliers';

describe('RecommendedSuppliers', () => {
  it('renders the section heading and marketplace eyebrow', () => {
    render(<RecommendedSuppliers />);
    expect(screen.getByText('Recommended suppliers')).toBeTruthy();
    expect(screen.getByText('Marketplace')).toBeTruthy();
  });

  it('is visibly marked as example / coming-soon data', () => {
    render(<RecommendedSuppliers />);
    expect(screen.getByText(/example/i)).toBeTruthy();
  });

  it('renders every example supplier card', () => {
    render(<RecommendedSuppliers />);
    for (const name of [
      'Highland Dairy Co',
      'Greenside Produce',
      'Westmill Bakery',
      'Northstar Coffee',
      "Butcher's Choice",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('renders exactly one "New supplier" ribbon', () => {
    render(<RecommendedSuppliers />);
    expect(screen.getAllByText('New supplier')).toHaveLength(1);
  });

  it('has left and right scroll controls that do not throw when clicked', () => {
    render(<RecommendedSuppliers />);
    expect(() => {
      fireEvent.click(screen.getByLabelText('Scroll left'));
      fireEvent.click(screen.getByLabelText('Scroll right'));
    }).not.toThrow();
  });

  it('renders an inert "Discover suppliers" affordance', () => {
    render(<RecommendedSuppliers />);
    const btn = screen.getByRole('button', { name: 'Discover suppliers' });
    expect(btn).toHaveProperty('disabled', true);
  });
});
