import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ListSpinner } from './ListSpinner';

describe('ListSpinner', () => {
  it('renders a spinner element', () => {
    const { container } = render(<ListSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
