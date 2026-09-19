import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaxClassification } from '@wholo/types';
import type { TaxType } from '@wholo/types';
import { TaxTypeForm } from './TaxTypeForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const taxType: TaxType = {
  id: 'tt-1', name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00',
  active: true, isDefault: false,
} as TaxType;

describe('TaxTypeForm', () => {
  it('lets someone who can manage tax types save and deactivate', () => {
    render(<TaxTypeForm mode="edit" initialValues={taxType} onSubmit={vi.fn()} onDeactivate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deactivate tax type/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeEnabled();
  });

  it('shows a read-only viewer the details with no way to change them — just a way back', () => {
    render(<TaxTypeForm mode="edit" initialValues={taxType} onSubmit={vi.fn()} onDeactivate={vi.fn()} readOnly />);

    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Name')).toHaveValue('Standard rate');
    expect(screen.getByLabelText('Classification')).toBeDisabled();
    expect(screen.getByLabelText('Rate')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deactivate tax type/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to tax types' })).toHaveAttribute('href', '/tax-types');
  });
});
