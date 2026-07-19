import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListTableShell } from './ListTableShell';

describe('ListTableShell', () => {
  it('renders its children inside the wrapper', () => {
    render(
      <ListTableShell>
        <table>
          <tbody>
            <tr><td>Row content</td></tr>
          </tbody>
        </table>
      </ListTableShell>,
    );
    expect(screen.getByText('Row content')).toBeInTheDocument();
  });
});
