'use client';

import { useState } from 'react';
import { adminDeliveryRunsApi, ApiError } from '@wholo/admin-api-client';
import { useAuth } from '@/lib/auth-context';

interface Props {
  runId: string;
  // True while the run is OPEN — manifest generation only makes sense once
  // the run's stop order is finalized (READY), so downloads are locked
  // until then. Mirrors RunDriverField's locked prop, inverted.
  locked: boolean;
}

// Sources its own access token via useAuth rather than being prop-drilled
// like onMarkReady/onReopen — a download has no board-state mutation to
// route back through page.tsx's handler plumbing, unlike every other action
// in RunHeaderControls.
export function DriverManifestButton({ runId, locked }: Props) {
  const { accessToken } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!accessToken || downloading || locked) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await adminDeliveryRunsApi.downloadManifest(runId);
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
        disabled={locked || downloading}
        title={locked ? 'Mark the run ready to download the driver manifest' : undefined}
        className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          locked
            ? 'border-border text-text hover:bg-border/20'
            : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
        }`}
      >
        {downloading ? 'Generating…' : 'Driver manifest'}
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
