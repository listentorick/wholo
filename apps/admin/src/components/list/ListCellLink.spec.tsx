import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListCellLink } from './ListCellLink';

describe('ListCellLink', () => {
  it('renders a link to the given href with its children', () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <ListCellLink href="/products/123/edit">Widget</ListCellLink>
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const link = screen.getByRole('link', { name: 'Widget' });
    expect(link).toHaveAttribute('href', '/products/123/edit');
  });
});
