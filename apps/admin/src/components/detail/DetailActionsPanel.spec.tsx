import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailActionsPanel } from './DetailActionsPanel';

describe('DetailActionsPanel', () => {
  it('renders a native submit button for a primary action with type submit', () => {
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[{ key: 'save', label: 'Save changes', tone: 'primary', type: 'submit' }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('type', 'submit');
  });

  it('calls onClick for a button-type action', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[{ key: 'save', label: 'Save changes', tone: 'primary', onClick }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders an href action as a link', () => {
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[{ key: 'discard', label: 'Discard', href: '/products' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Discard' })).toHaveAttribute('href', '/products');
  });

  it('shows the loading label and disables the action while loading', () => {
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          { key: 'save', label: 'Save changes', tone: 'primary', loading: true, loadingLabel: 'Saving…' },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
  });

  it('opens a modal dialog for dangerZone actions, boxed in a single Danger zone card', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          {
            key: 'delete',
            label: 'Delete product',
            tone: 'danger',
            dangerZone: true,
            onClick,
            confirm: { description: 'This cannot be undone.', confirmLabel: 'Yes, delete' },
          },
        ]}
      />,
    );
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(screen.queryByText('This cannot be undone.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete product' }));
    expect(onClick).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('cancels the modal without calling onClick, and Escape does the same', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[{ key: 'delete', label: 'Delete', tone: 'danger', dangerZone: true, onClick, confirm: {} }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders two dangerZone actions inside a single shared Danger zone card, not one per action', () => {
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          { key: 'delete', label: 'Delete', tone: 'danger', dangerZone: true, onClick: vi.fn(), confirm: {} },
          { key: 'purge', label: 'Purge history', tone: 'danger', dangerZone: true, onClick: vi.fn(), confirm: {} },
        ]}
      />,
    );
    expect(screen.getAllByText('Danger zone')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purge history' })).toBeInTheDocument();
  });

  it('renders a danger-tone action without dangerZone inline in the main card, not boxed', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          { key: 'order-as', label: 'Order on behalf', onClick: vi.fn() },
          {
            key: 'suspend',
            label: 'Suspend',
            tone: 'danger',
            onClick,
            confirm: { prompt: 'Suspend this customer?', confirmLabel: 'Yes, suspend' },
          },
        ]}
      />,
    );
    expect(screen.queryByText('Danger zone')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Order on behalf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Suspend this customer?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, suspend' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('disables Cancel and Confirm and keeps the modal open while the action is loading', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          {
            key: 'suspend',
            label: 'Suspend',
            tone: 'danger',
            onClick,
            confirm: { prompt: 'Suspend this customer?', confirmLabel: 'Yes, suspend' },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    rerender(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          {
            key: 'suspend',
            label: 'Suspend',
            tone: 'danger',
            onClick,
            loading: true,
            loadingLabel: 'Suspending…',
            confirm: { prompt: 'Suspend this customer?', confirmLabel: 'Yes, suspend' },
          },
        ]}
      />,
    );
    const dialog = screen.getByRole('dialog');
    // The trigger button behind the modal also shows the loading label from the same
    // `action.loading` prop — scope queries to the dialog to disambiguate.
    expect(within(dialog).getByRole('button', { name: 'Suspending…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders main actions inline in footer layout', () => {
    render(
      <DetailActionsPanel
        layout="footer"
        actions={[
          { key: 'cancel', label: 'Cancel', href: '/catalogues' },
          { key: 'save', label: 'Save changes', tone: 'primary', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('opens the modal for a dangerZone action in footer layout too, instead of firing immediately', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="footer"
        actions={[
          {
            key: 'delete',
            label: 'Delete catalogue',
            tone: 'danger',
            dangerZone: true,
            onClick,
            confirm: { prompt: 'Delete this catalogue?', confirmLabel: 'Yes, delete' },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete catalogue' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows a success or error banner', () => {
    const { rerender } = render(
      <DetailActionsPanel layout="sidebar" actions={[]} banner={{ success: 'Saved' }} />,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();

    rerender(<DetailActionsPanel layout="sidebar" actions={[]} banner={{ error: 'Something went wrong' }} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
