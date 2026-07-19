import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListEmptyState } from './ListEmptyState';

describe('ListEmptyState', () => {
  it('renders the icon, title, and description', () => {
    render(
      <ListEmptyState
        icon={<svg aria-hidden data-testid="icon" />}
        title="No products yet"
        description="Add your first product to get started."
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(screen.getByText('Add your first product to get started.')).toBeInTheDocument();
  });

  it('renders the action only when provided', () => {
    const { rerender } = render(
      <ListEmptyState icon={<svg aria-hidden />} title="t" description="d" />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <ListEmptyState
        icon={<svg aria-hidden />}
        title="t"
        description="d"
        action={<button type="button">Add product</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument();
  });

  it('applies a default icon background and allows overriding it', () => {
    const { container, rerender } = render(
      <ListEmptyState icon={<svg aria-hidden />} title="t" description="d" />,
    );
    expect(container.querySelector('.bg-primary\\/10')).toBeInTheDocument();

    rerender(
      <ListEmptyState icon={<svg aria-hidden />} title="t" description="d" iconBgClassName="bg-[#fef3e8]" />,
    );
    expect(container.querySelector('.bg-\\[\\#fef3e8\\]')).toBeInTheDocument();
  });
});
