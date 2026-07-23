import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectInput } from './SelectInput';

describe('SelectInput', () => {
  it('renders the given options', () => {
    render(
      <SelectInput value="a" onChange={() => {}}>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </SelectInput>,
    );
    expect(screen.getByRole('combobox')).toHaveValue('a');
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
  });

  it('disables the select when disabled is true', () => {
    render(
      <SelectInput disabled value="a" onChange={() => {}}>
        <option value="a">Option A</option>
      </SelectInput>,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
