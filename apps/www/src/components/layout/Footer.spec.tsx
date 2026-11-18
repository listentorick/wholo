import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
  it('links to the help site', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', 'https://help.stocdup.com');
  });

  it('links to the privacy notice', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
});
