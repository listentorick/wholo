import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it('renders as a label associated with the given htmlFor', () => {
    render(<FieldLabel htmlFor="name">Name</FieldLabel>);
    const label = screen.getByText('Name');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'name');
  });
});
