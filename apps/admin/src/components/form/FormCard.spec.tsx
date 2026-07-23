import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormCard } from './FormCard';

describe('FormCard', () => {
  it('renders children', () => {
    render(<FormCard>content</FormCard>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders a title and description when given', () => {
    render(
      <FormCard title="Profile details" description="Basic information">
        content
      </FormCard>,
    );
    expect(screen.getByRole('heading', { name: 'Profile details' })).toBeInTheDocument();
    expect(screen.getByText('Basic information')).toBeInTheDocument();
  });

  it('omits the header entirely when no title is given', () => {
    render(<FormCard>content</FormCard>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
