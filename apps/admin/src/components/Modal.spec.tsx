import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <Modal onClose={onClose} labelledBy="modal-title" closable={props.closable}>
      <h3 id="modal-title">Suspend this customer?</h3>
      <button data-modal-cancel type="button">
        Cancel
      </button>
      <button type="button">Yes, suspend</button>
    </Modal>,
  );
  return onClose;
}

describe('Modal', () => {
  it('renders its content via a portal with dialog semantics', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    expect(screen.getByText('Suspend this customer?')).toBeInTheDocument();
  });

  it('closes on Escape by default', async () => {
    const onClose = renderModal();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click by default', async () => {
    const onClose = renderModal();
    // The dialog card stops propagation, so clicking it should not close —
    // click the backdrop itself, which is the dialog's parent element.
    const backdrop = screen.getByRole('dialog').parentElement!;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when the card itself is clicked', async () => {
    const onClose = renderModal();
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Escape and backdrop click when closable is false', async () => {
    const onClose = renderModal({ closable: false });
    await userEvent.keyboard('{Escape}');
    const backdrop = screen.getByRole('dialog').parentElement!;
    await userEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the cancel button on open', () => {
    renderModal();
    expect(screen.getByText('Cancel')).toHaveFocus();
  });
});
