import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('requires a two-step confirm for danger-tone actions', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[
          {
            key: 'delete',
            label: 'Delete product',
            tone: 'danger',
            onClick,
            confirm: { description: 'This cannot be undone.', confirmLabel: 'Yes, delete' },
          },
        ]}
      />,
    );
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete product' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('cancels the confirm step without calling onClick', async () => {
    const onClick = vi.fn();
    render(
      <DetailActionsPanel
        layout="sidebar"
        actions={[{ key: 'delete', label: 'Delete', tone: 'danger', onClick, confirm: {} }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
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

  it('shows a success or error banner', () => {
    const { rerender } = render(
      <DetailActionsPanel layout="sidebar" actions={[]} banner={{ success: 'Saved' }} />,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();

    rerender(<DetailActionsPanel layout="sidebar" actions={[]} banner={{ error: 'Something went wrong' }} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
