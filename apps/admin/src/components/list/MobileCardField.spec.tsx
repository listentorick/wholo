import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileCardField } from './MobileCardField';

describe('MobileCardField', () => {
  it('renders the label and value', () => {
    render(<MobileCardField label="Provider code" value="SRINPUT" />);
    expect(screen.getByText('Provider code')).toBeInTheDocument();
    expect(screen.getByText('SRINPUT')).toBeInTheDocument();
  });

  it('renders a muted-tone value with lighter styling than the default value', () => {
    render(<MobileCardField label="Match reason" value="Matched by name" tone="muted" />);
    expect(screen.getByText('Matched by name')).toHaveClass('text-muted');
  });

  it('renders a mono value for technical identifiers', () => {
    render(<MobileCardField label="Account number" value="XC-1" mono />);
    expect(screen.getByText('XC-1')).toHaveClass('font-mono');
  });

  it('accepts non-string values', () => {
    render(<MobileCardField label="Stock" value={<span>42 units</span>} />);
    expect(screen.getByText('42 units')).toBeInTheDocument();
  });
});
