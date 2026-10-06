import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PaymentTerm } from '@wholo/types';
import { PaymentTermForm } from './PaymentTermForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const preview = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return { ...actual, adminPaymentTermsApi: { preview: (...a: unknown[]) => preview(...a) } };
});

const term = (overrides: Partial<PaymentTerm> = {}): PaymentTerm => ({
  id: 'pt-1', distributorId: 'dist-1', name: 'Net 30', type: 'DAYS_AFTER_INVOICE', days: 30, dayOfWeek: null, dayOfMonth: null,
  summary: '30 days after the invoice date', isSystem: false, isDefault: false, active: true, customerCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  preview.mockResolvedValue({ summary: '30 days after the invoice date', examples: [{ invoiceDate: '2026-10-04', dueDate: '2026-11-03' }] });
});

describe('PaymentTermForm', () => {
  it('creates an "N days after invoice" term and opens it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(term({ id: 'pt-new' }));
    render(<PaymentTermForm mode="create" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Net 14' } });
    fireEvent.change(screen.getByLabelText('Days after the invoice date'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create payment term' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Net 14', type: 'DAYS_AFTER_INVOICE', days: 14, dayOfWeek: null, dayOfMonth: null }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/payment-terms/pt-new/edit'));
  });

  it('picks a rule when its own field is used, and sends only that rule\'s value', async () => {
    const onSubmit = vi.fn().mockResolvedValue(term());
    render(<PaymentTermForm mode="create" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fridays' } });
    fireEvent.change(screen.getByLabelText('Day of the week'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Make this the default for customers without their own terms'));
    fireEvent.click(screen.getByRole('button', { name: 'Create payment term' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Fridays', type: 'DAY_OF_WEEK', days: null, dayOfWeek: 5, dayOfMonth: null, makeDefault: true }),
    );
  });

  it('refuses a day of the month outside 1–31', async () => {
    const onSubmit = vi.fn();
    render(<PaymentTermForm mode="create" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bad' } });
    fireEvent.change(screen.getByLabelText('Day of the month'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create payment term' }));

    expect(await screen.findByText('Enter a day from 1 to 31')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    const onSubmit = vi.fn();
    render(<PaymentTermForm mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create payment term' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows example due dates from the API for the rule being edited', async () => {
    render(<PaymentTermForm mode="edit" initialValues={term()} onSubmit={vi.fn()} />);

    expect(await screen.findByText(/Invoiced 4 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText('3 Nov 2026')).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith({ type: 'DAYS_AFTER_INVOICE', days: 30 });
  });

  it('offers Make default and Deactivate on an active, non-default term', () => {
    render(
      <PaymentTermForm mode="edit" initialValues={term({ customerCount: 2 })} onSubmit={vi.fn()} onMakeDefault={vi.fn()} onDeactivate={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Make default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deactivate payment term/ })).toBeInTheDocument();
  });

  it('does not offer Deactivate or Make default on the current default', () => {
    render(
      <PaymentTermForm mode="edit" initialValues={term({ isDefault: true })} onSubmit={vi.fn()} onMakeDefault={vi.fn()} onDeactivate={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Make default' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deactivate payment term/ })).not.toBeInTheDocument();
  });

  it('offers Reactivate on an inactive term', () => {
    render(<PaymentTermForm mode="edit" initialValues={term({ active: false })} onSubmit={vi.fn()} onReactivate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('shows the integration term by the integration\'s name, with nothing to edit but Make default', () => {
    render(
      <PaymentTermForm
        mode="edit"
        initialValues={term({ id: 'pt-sys', name: 'Set by accounting software', type: 'ACCOUNTING_SYSTEM_DEFAULT', days: null, isSystem: true })}
        accountingProvider="XERO"
        onSubmit={vi.fn()}
        onMakeDefault={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(screen.getByText('Xero manages due date')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make default' })).toBeInTheDocument();
  });

  it('shows a read-only viewer the term with no way to change it — just a way back', () => {
    render(<PaymentTermForm mode="edit" initialValues={term()} onSubmit={vi.fn()} readOnly />);
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to payment terms' })).toHaveAttribute('href', '/payment-terms');
  });
});
