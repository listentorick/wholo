import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { QuantityStepper } from './QuantityStepper';

describe('QuantityStepper', () => {
  it('renders the current value in the field', () => {
    render(<QuantityStepper value={5} min={0} onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Quantity for Egg tarts')).toHaveValue('5');
  });

  it('does not call onChange while typing — only on blur', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts');
    fireEvent.change(input, { target: { value: '36' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits the typed value on blur', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts');
    fireEvent.change(input, { target: { value: '36' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(36);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('commits the typed value on Enter, exactly once', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts') as HTMLInputElement;
    input.focus(); // real DOM focus (not fireEvent.focus) so the later blur() call actually fires
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(12);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clamps a value below min back to min on commit', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={3} min={1} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(1);
    expect(input).toHaveValue('1');
  });

  it('falls back to min when the entry is not a number', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={1} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(1);
    expect(input).toHaveValue('1');
  });

  it('does not call onChange on blur when the committed value is unchanged', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    fireEvent.blur(screen.getByLabelText('Quantity for Egg tarts'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('increase button calls onChange with value + 1', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    fireEvent.click(screen.getByLabelText('Increase quantity for Egg tarts'));

    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('decrease button calls onChange with value - 1', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    fireEvent.click(screen.getByLabelText('Decrease quantity for Egg tarts'));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disables the decrease button at min', () => {
    render(<QuantityStepper value={1} min={1} onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Decrease quantity for Egg tarts')).toBeDisabled();
  });

  it('does not disable the increase button at min (no upper bound)', () => {
    render(<QuantityStepper value={1} min={1} onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Increase quantity for Egg tarts')).not.toBeDisabled();
  });

  it('disables both buttons and the field while saving', () => {
    render(<QuantityStepper value={5} min={0} saving onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Increase quantity for Egg tarts')).toBeDisabled();
    expect(screen.getByLabelText('Decrease quantity for Egg tarts')).toBeDisabled();
    expect(screen.getByLabelText('Quantity for Egg tarts')).toBeDisabled();
  });

  it('disables both buttons and the field when disabled', () => {
    render(<QuantityStepper value={5} min={0} disabled onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Increase quantity for Egg tarts')).toBeDisabled();
    expect(screen.getByLabelText('Decrease quantity for Egg tarts')).toBeDisabled();
    expect(screen.getByLabelText('Quantity for Egg tarts')).toBeDisabled();
  });

  it('gives each product a distinct accessible name', () => {
    const { rerender } = render(<QuantityStepper value={1} min={0} onChange={() => {}} itemLabel="Egg tarts" />);
    expect(screen.getByLabelText('Increase quantity for Egg tarts')).toBeTruthy();

    rerender(<QuantityStepper value={1} min={0} onChange={() => {}} itemLabel="Custard buns" />);
    expect(screen.getByLabelText('Increase quantity for Custard buns')).toBeTruthy();
  });

  it('does not clobber an in-progress edit when the value prop changes while focused', () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={1} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    const input = screen.getByLabelText('Quantity for Egg tarts');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });

    // Simulates an optimistic cart update landing (e.g. from a sibling stepper) while this field is mid-edit.
    rerender(<QuantityStepper value={2} min={0} onChange={onChange} itemLabel="Egg tarts" />);

    expect(input).toHaveValue('3');
  });

  it('resyncs from a new value prop once the field is not focused', () => {
    const { rerender } = render(<QuantityStepper value={1} min={0} onChange={() => {}} itemLabel="Egg tarts" />);

    rerender(<QuantityStepper value={7} min={0} onChange={() => {}} itemLabel="Egg tarts" />);

    expect(screen.getByLabelText('Quantity for Egg tarts')).toHaveValue('7');
  });
});
