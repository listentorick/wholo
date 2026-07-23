import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkImportControl } from './BulkImportControl';

describe('BulkImportControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when nothing is selected', () => {
    render(
      <BulkImportControl
        token="token-1"
        entityLabel="products"
        selectedCount={0}
        buildDto={(honourSuggestions) => ({ ids: [], honourSuggestions })}
        bulkImport={vi.fn()}
        onQueued={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bulk import' })).toBeDisabled();
  });

  it('shows the selected count in the button label once something is selected', () => {
    render(
      <BulkImportControl
        token="token-1"
        entityLabel="products"
        selectedCount={3}
        buildDto={(honourSuggestions) => ({ ids: ['a', 'b', 'c'], honourSuggestions })}
        bulkImport={vi.fn()}
        onQueued={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bulk import (3)' })).toBeEnabled();
  });

  it('defaults honourSuggestions to false and calls bulkImport with the built dto', async () => {
    const bulkImport = vi.fn().mockResolvedValue({ jobId: 'job-1' });
    const onQueued = vi.fn();
    const user = userEvent.setup();

    render(
      <BulkImportControl
        token="token-1"
        entityLabel="products"
        selectedCount={2}
        buildDto={(honourSuggestions) => ({ ids: ['a', 'b'], honourSuggestions })}
        bulkImport={bulkImport}
        onQueued={onQueued}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bulk import (2)' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(bulkImport).toHaveBeenCalledWith({ ids: ['a', 'b'], honourSuggestions: false }, 'token-1'),
    );
    expect(onQueued).toHaveBeenCalled();
  });

  it('passes honourSuggestions: true when the checkbox is checked', async () => {
    const bulkImport = vi.fn().mockResolvedValue({ jobId: 'job-1' });
    const user = userEvent.setup();

    render(
      <BulkImportControl
        token="token-1"
        entityLabel="contacts"
        selectedCount={1}
        buildDto={(honourSuggestions) => ({ ids: ['a'], honourSuggestions })}
        bulkImport={bulkImport}
        onQueued={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByLabelText(/Honour suggested matches/));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(bulkImport).toHaveBeenCalledWith({ ids: ['a'], honourSuggestions: true }, 'token-1'));
  });

  it('shows a queued confirmation after a successful import', async () => {
    const bulkImport = vi.fn().mockResolvedValue({ jobId: 'job-1' });
    const user = userEvent.setup();

    render(
      <BulkImportControl
        token="token-1"
        entityLabel="products"
        selectedCount={1}
        buildDto={(honourSuggestions) => ({ ids: ['a'], honourSuggestions })}
        bulkImport={bulkImport}
        onQueued={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByText(/Import queued/)).toBeInTheDocument());
  });

  it('shows an error and keeps the popover open when the import call fails', async () => {
    const bulkImport = vi.fn().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(
      <BulkImportControl
        token="token-1"
        entityLabel="products"
        selectedCount={1}
        buildDto={(honourSuggestions) => ({ ids: ['a'], honourSuggestions })}
        bulkImport={bulkImport}
        onQueued={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByText('Failed to queue the import. Please try again.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });
});
