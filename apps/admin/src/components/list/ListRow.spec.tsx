import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListRow } from './ListRow';

describe('ListRow', () => {
  it('renders its children inside a table row', () => {
    render(
      <table>
        <tbody>
          <ListRow>
            <td>Cell content</td>
          </ListRow>
        </tbody>
      </table>,
    );
    expect(screen.getByText('Cell content')).toBeInTheDocument();
    expect(screen.getByText('Cell content').closest('tr')).toHaveClass('cursor-pointer');
  });
});
