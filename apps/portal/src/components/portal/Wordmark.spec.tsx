import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('renders the hexagon mark and the "stocdup" lockup with "up" in cobalt', () => {
    const { container } = render(<Wordmark />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/logos/stocdup-logo-only.png');
    const up = screen.getByText('up');
    expect(up.className).toContain('text-primary');
    expect(up.parentElement?.textContent).toBe('stocdup');
  });

  it('applies a custom mark size and text class', () => {
    const { container } = render(<Wordmark markSize={40} textClassName="text-2xl" />);
    expect(container.querySelector('img')).toHaveAttribute('width', '40');
    expect(screen.getByText('up').parentElement?.className).toContain('text-2xl');
  });
});
