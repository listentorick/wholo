import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children and the hairline container by default', () => {
    render(<Card>body</Card>);
    const el = screen.getByText('body');
    expect(el).toHaveClass('border', 'bg-white');
    // interactive by default: CSS hover lift, with a reduced-motion opt-out
    expect(el.className).toContain('hover:-translate-y-1');
    expect(el.className).toContain('motion-reduce:hover:translate-y-0');
  });

  it('drops the hover affordance when interactive={false}', () => {
    render(<Card interactive={false}>flat</Card>);
    expect(screen.getByText('flat').className).not.toContain('hover:-translate-y-1');
  });

  it('renders as the requested element', () => {
    render(
      <ul>
        <Card as="li">item</Card>
      </ul>,
    );
    expect(screen.getByText('item').tagName).toBe('LI');
  });
});
