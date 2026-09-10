import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));

import { AboutSection } from './AboutSection';

const distributor = {
  name: 'Mere Wine Co',
  tagline: 'Passionate about wine',
  aboutText: 'We supply restaurants and bars.',
} as DistributorInfo;

describe('AboutSection', () => {
  it('renders inside a #about scroll section', () => {
    const { container } = render(<AboutSection distributor={distributor} relationshipStatus={null} />);
    const section = container.querySelector('section#about');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('data-scroll-section');
  });

  it('shows the tagline, about text and the relationship CTA', () => {
    render(<AboutSection distributor={distributor} relationshipStatus={null} />);
    expect(screen.getByText('Passionate about wine')).toBeInTheDocument();
    expect(screen.getByText('We supply restaurants and bars.')).toBeInTheDocument();
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });
});
