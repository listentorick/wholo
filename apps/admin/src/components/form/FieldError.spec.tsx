import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldError } from './FieldError';

describe('FieldError', () => {
  it('renders the message when given', () => {
    render(<FieldError message="Title is required" />);
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('renders nothing when no message is given', () => {
    const { container } = render(<FieldError />);
    expect(container).toBeEmptyDOMElement();
  });
});
