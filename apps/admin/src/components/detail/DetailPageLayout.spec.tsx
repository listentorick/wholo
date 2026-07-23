import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailPageLayout } from './DetailPageLayout';

describe('DetailPageLayout', () => {
  it('renders children in a single column when no sidebar is given', () => {
    const { container } = render(
      <DetailPageLayout>
        <p>Form content</p>
      </DetailPageLayout>,
    );
    expect(screen.getByText('Form content')).toBeInTheDocument();
    expect(container.querySelector('.grid')).not.toBeInTheDocument();
  });

  it('renders a two-column sticky sidebar layout when a sidebar is given', () => {
    const { container } = render(
      <DetailPageLayout sidebar={<p>Sidebar content</p>}>
        <p>Form content</p>
      </DetailPageLayout>,
    );
    expect(screen.getByText('Form content')).toBeInTheDocument();
    expect(screen.getByText('Sidebar content')).toBeInTheDocument();
    expect(container.querySelector('.grid')).toBeInTheDocument();
    expect(container.querySelector('.lg\\:sticky')).toBeInTheDocument();
  });
});
