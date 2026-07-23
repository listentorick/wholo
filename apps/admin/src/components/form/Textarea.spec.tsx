import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders with the given placeholder and defaults to 3 rows', () => {
    render(<Textarea placeholder="Notes…" value="" onChange={() => {}} />);
    const textarea = screen.getByPlaceholderText('Notes…');
    expect(textarea).toHaveAttribute('rows', '3');
  });

  it('respects an explicit rows override', () => {
    render(<Textarea rows={5} value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
  });
});
