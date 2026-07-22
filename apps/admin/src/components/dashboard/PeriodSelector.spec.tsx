import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodSelector } from './PeriodSelector';

describe('PeriodSelector', () => {
  it('marks the current period as selected', () => {
    render(<PeriodSelector period="month" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Month to date' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the clicked period key', async () => {
    const onChange = vi.fn();
    render(<PeriodSelector period="month" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }));

    expect(onChange).toHaveBeenCalledWith('rolling30');
  });
});
