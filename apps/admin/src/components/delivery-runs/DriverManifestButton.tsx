'use client';

import { useState } from 'react';
import { adminDeliveryRunsApi, ApiError } from '@wholo/admin-api-client';
import { useAuth } from '@/lib/auth-context';

interface Props {
  runId: string;
}

// Sources its own access token via useAuth rather than being prop-drilled
// like onMarkReady/onReopen — a download has no board-state mutation to
// route back through page.tsx's handler plumbing, unlike every other action
// in RunHeaderControls.
export function DriverManifestButton({ runId }: Props) {
  const { accessToken } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!accessToken || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await adminDeliveryRunsApi.downloadManifest(accessToken, runId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `driver-manifest-${runId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to download the driver manifest');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={downloading}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {downloading ? 'Generating…' : 'Driver manifest'}
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
