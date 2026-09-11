import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));

let mockCtx: { distributor: DistributorInfo | null; relationshipStatus: string | null };
vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => mockCtx };
});

import { AboutSection } from './AboutSection';

beforeEach(() => {
  mockCtx = {
    distributor: {
      name: 'Mere Wine Co',
      tagline: 'Passionate about wine',
      aboutText: 'We supply restaurants and bars.',
    } as DistributorInfo,
    relationshipStatus: null,
  };
});

describe('AboutSection', () => {
  it('always renders the #about scroll section shell', () => {
    mockCtx.distributor = null;
    const { container } = render(<AboutSection />);
    const section = container.querySelector('section#about');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('data-scroll-section');
  });

  it('shows the tagline, about text and the relationship CTA once the distributor loads', () => {
    render(<AboutSection />);
    expect(screen.getByText('Passionate about wine')).toBeInTheDocument();
    expect(screen.getByText('We supply restaurants and bars.')).toBeInTheDocument();
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });
});
