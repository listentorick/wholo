import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders an input with the given placeholder and value', () => {
    render(<TextInput placeholder="e.g. WINE-CAB-2021" value="ABC" onChange={() => {}} id="sku" />);
    const input = screen.getByPlaceholderText('e.g. WINE-CAB-2021');
    expect(input).toHaveValue('ABC');
    expect(input).toHaveAttribute('id', 'sku');
  });

  it('disables the input when disabled is true', () => {
    render(<TextInput disabled value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
