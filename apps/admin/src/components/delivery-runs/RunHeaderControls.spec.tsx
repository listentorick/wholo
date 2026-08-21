import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunHeaderControls } from './RunHeaderControls';

// A READY run renders DriverManifestButton, which reads useAuth() on every
// render (not just on click) — needed even in tests that never click it.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1' }),
}));

const NOOP = {
  pending: false,
  onMarkReady: vi.fn().mockResolvedValue(undefined),
  onReopen: vi.fn().mockResolvedValue(undefined),
  onSetDriver: vi.fn(),
};

describe('RunHeaderControls', () => {
  it('shows the run name, an Open badge, and a Mark ready trigger for an OPEN run', () => {
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'OPEN' }} {...NOOP} />);
    expect(screen.getByRole('heading', { name: 'Yorkshire' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
  });

  it('shows a Ready badge and a Reopen trigger for a READY run', () => {
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'READY' }} {...NOOP} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('opens MarkReadyDialog on click and calls onMarkReady with the run id on confirm', async () => {
    const onMarkReady = vi.fn().mockResolvedValue(undefined);
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'OPEN' }} {...NOOP} onMarkReady={onMarkReady} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark ready' }));

    expect(onMarkReady).toHaveBeenCalledWith('run-1');
  });

  it('closes MarkReadyDialog without calling onMarkReady when Cancel is clicked', async () => {
    const onMarkReady = vi.fn();
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'OPEN' }} {...NOOP} onMarkReady={onMarkReady} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onMarkReady).not.toHaveBeenCalled();
  });

  it('opens ReopenConfirm on click and calls onReopen with the run id on confirm', async () => {
    const onReopen = vi.fn().mockResolvedValue(undefined);
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'READY' }} {...NOOP} onReopen={onReopen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen' }));

    expect(onReopen).toHaveBeenCalledWith('run-1');
  });

  it('disables the Mark ready trigger while pending', () => {
    render(<RunHeaderControls run={{ runId: 'run-1', name: 'Yorkshire', driverName: null, status: 'OPEN' }} {...NOOP} pending />);
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeDisabled();
  });
});
