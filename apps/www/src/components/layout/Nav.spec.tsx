import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Nav } from './Nav';
import { NAV_LINKS } from '@/content';

describe('Nav', () => {
  it('renders the wordmark and every nav link', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /stocdup, back to top/i })).toBeInTheDocument();
    for (const link of NAV_LINKS) {
      expect(screen.getAllByRole('link', { name: link.label }).length).toBeGreaterThan(0);
    }
  });

  it('has a Register interest CTA', () => {
    render(<Nav />);
    expect(screen.getAllByRole('link', { name: 'Register interest' }).length).toBeGreaterThan(0);
  });

  it('toggles the mobile menu open and closed', async () => {
    const user = userEvent.setup();
    render(<Nav />);
    const toggle = screen.getByRole('button', { name: /open menu/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /close menu/i }));
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
