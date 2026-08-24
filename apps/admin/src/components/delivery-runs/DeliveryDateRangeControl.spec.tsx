import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryDateRangeControl } from './DeliveryDateRangeControl';

describe('DeliveryDateRangeControl', () => {
  it('renders the range for a week within a single month', () => {
    render(
      <DeliveryDateRangeControl
        weekStart={new Date(2026, 7, 17)}
        weekEnd={new Date(2026, 7, 23)}
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
      />,
    );

    expect(screen.getByText('17–23 Aug 2026')).toBeInTheDocument();
  });

  it('renders a month-crossing range', () => {
    render(
      <DeliveryDateRangeControl
        weekStart={new Date(2026, 7, 31)}
        weekEnd={new Date(2026, 8, 6)}
        selectedDate="2026-08-31"
        onSelectDate={vi.fn()}
      />,
    );

    expect(screen.getByText('31 Aug – 6 Sep 2026')).toBeInTheDocument();
  });

  it('calls onSelectDate with the picked date when the date input changes', () => {
    const onSelectDate = vi.fn();
    render(
      <DeliveryDateRangeControl
        weekStart={new Date(2026, 7, 17)}
        weekEnd={new Date(2026, 7, 23)}
        selectedDate="2026-08-19"
        onSelectDate={onSelectDate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Jump to a specific date'), { target: { value: '2026-09-15' } });

    expect(onSelectDate).toHaveBeenCalledWith('2026-09-15');
  });

  it('does not call onSelectDate when the date input is cleared', () => {
    const onSelectDate = vi.fn();
    render(
      <DeliveryDateRangeControl
        weekStart={new Date(2026, 7, 17)}
        weekEnd={new Date(2026, 7, 23)}
        selectedDate="2026-08-19"
        onSelectDate={onSelectDate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Jump to a specific date'), { target: { value: '' } });

    expect(onSelectDate).not.toHaveBeenCalled();
  });
});
