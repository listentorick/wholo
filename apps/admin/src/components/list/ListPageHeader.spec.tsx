import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListPageHeader } from './ListPageHeader';

describe('ListPageHeader', () => {
  it('renders the title', () => {
    render(<ListPageHeader title="Products" />);
    expect(screen.getByRole('heading', { name: /Products/ })).toBeInTheDocument();
  });

  it('renders the count in brackets next to the title when greater than 0', () => {
    render(<ListPageHeader title="Products" count={42} />);
    expect(screen.getByText('(42)')).toBeInTheDocument();
  });

  it('omits the count when it is 0', () => {
    render(<ListPageHeader title="Products" count={0} />);
    expect(screen.queryByText('(0)')).not.toBeInTheDocument();
  });

  it('omits the count when undefined', () => {
    render(<ListPageHeader title="Products" />);
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it('renders arbitrary action content', () => {
    render(
      <ListPageHeader
        title="Products"
        actions={
          <>
            <button type="button">Import</button>
            <button type="button">Add product</button>
          </>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument();
  });
});
