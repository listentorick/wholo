import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListTh } from './ListTh';

describe('ListTh', () => {
  it('renders its children', () => {
    render(
      <table>
        <thead>
          <tr>
            <ListTh>Product</ListTh>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('merges a custom className with the base classes', () => {
    render(
      <table>
        <thead>
          <tr>
            <ListTh className="text-right">Status</ListTh>
          </tr>
        </thead>
      </table>,
    );
    const th = screen.getByText('Status');
    expect(th.className).toContain('text-right');
    expect(th.className).toContain('uppercase');
  });
});
