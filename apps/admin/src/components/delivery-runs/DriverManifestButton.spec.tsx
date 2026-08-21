import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@wholo/admin-api-client';
import { DriverManifestButton } from './DriverManifestButton';

const downloadManifest = vi.fn();

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminDeliveryRunsApi: { downloadManifest: (...args: unknown[]) => downloadManifest(...args) },
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1' }),
}));

describe('DriverManifestButton', () => {
  beforeEach(() => {
    downloadManifest.mockReset();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the manifest for the given run when clicked', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    downloadManifest.mockResolvedValue(blob);

    render(<DriverManifestButton runId="run-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Driver manifest' }));

    await waitFor(() => expect(downloadManifest).toHaveBeenCalledWith('token-1', 'run-1'));
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('shows a generating state while the download is in flight', async () => {
    let resolveDownload: (blob: Blob) => void;
    downloadManifest.mockReturnValue(new Promise((resolve) => { resolveDownload = resolve; }));

    render(<DriverManifestButton runId="run-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Driver manifest' }));

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();

    resolveDownload!(new Blob(['%PDF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Driver manifest' })).not.toBeDisabled());
  });

  it('shows an inline error and re-enables the button when the download fails, without crashing', async () => {
    downloadManifest.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Conflict', status: 422, detail: 'Run must be marked ready' }, 422));

    render(<DriverManifestButton runId="run-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Driver manifest' }));

    expect(await screen.findByText('Run must be marked ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Driver manifest' })).not.toBeDisabled();
  });
});
