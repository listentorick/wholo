import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RelationshipStatusBadge } from './RelationshipStatusBadge';

describe('RelationshipStatusBadge', () => {
  it('renders the given label', () => {
    render(<RelationshipStatusBadge label="Pending" tone="yellow" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders a different label for the suspended tone', () => {
    render(<RelationshipStatusBadge label="Suspended" tone="red" />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });
});
