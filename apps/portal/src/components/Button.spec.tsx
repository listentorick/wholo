import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and defaults to type="button"', () => {
    render(<Button>Add this supplier</Button>);
    const btn = screen.getByRole('button', { name: 'Add this supplier' });
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('uses the primary (Cobalt) variant by default with 6px corners', () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveClass('bg-primary', 'rounded-md');
  });

  it('applies the secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('border', 'bg-surface');
  });

  it('stretches with fullWidth', () => {
    render(<Button fullWidth>Place order</Button>);
    expect(screen.getByRole('button', { name: 'Place order' })).toHaveClass('w-full');
  });

  it('fires onClick and honours disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={onClick} disabled>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
