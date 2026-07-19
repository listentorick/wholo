import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, type StatusTone } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the given label', () => {
    render(<StatusBadge label="Active" tone="green" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  const cases: Array<{ tone: StatusTone; bg: string; text: string }> = [
    { tone: 'green', bg: '#dcfce7', text: '#15803d' },
    { tone: 'yellow', bg: '#fef9c3', text: '#a16207' },
    { tone: 'red', bg: '#fee2e2', text: '#b91c1c' },
    { tone: 'gray', bg: '#f3f4f6', text: '#6b7280' },
    { tone: 'blue', bg: '#dbeafe', text: '#1d4ed8' },
    { tone: 'orange', bg: '#fef3ec', text: '#d97036' },
  ];

  it.each(cases)('applies the correct colors for tone $tone', ({ tone, bg, text }) => {
    render(<StatusBadge label="Status" tone={tone} />);
    const badge = screen.getByText('Status');
    expect(badge.style.backgroundColor).toBe(hexToRgb(bg));
    expect(badge.style.color).toBe(hexToRgb(text));
  });
});

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
