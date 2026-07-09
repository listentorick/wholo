'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

interface Props {
  token: string;
}

export function XeroConnectionCard({ token }: Props) {
  const [connection, setConnection] = useState<AccountingConnectionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  useEffect(() => {
    adminAccountingApi
      .getConnection(token)
      .then((res) => setConnection(res ?? null))
      .catch(() => setLoadError('Failed to load connection status.'))
      .finally(() => setLoading(false));
  }, [token]);

  const isConnected = connection?.status === 'CONNECTED';
  const isError = connection?.status === 'ERROR';

  useEffect(() => {
    if (!isConnected) return;
    adminAccountingApi
      .countContactsNeedingAttention(token)
      .then((res) => setNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the badge just doesn't show if this fails.
      });
  }, [isConnected, token]);

  async function handleConnect() {
    setActionError(null);
    setConnecting(true);
    try {
      const { authorizationUrl } = await adminAccountingApi.createXeroAuthorizationUrl(token);
      window.location.href = authorizationUrl;
    } catch {
      setActionError('Failed to start the Xero connection. Please try again.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Xero? You can reconnect at any time.')) return;
    setActionError(null);
    setDisconnecting(true);
    try {
      await adminAccountingApi.disconnect(token);
      setConnection(null);
      setNeedsAttentionCount(0);
    } catch {
      setActionError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/xero.png" alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
          <div>
            <h2 className="text-sm font-semibold text-text">Xero</h2>
            <p className="mt-0.5 text-xs text-muted">Sync invoicing with your Xero organisation.</p>
          </div>
        </div>
        {isConnected && (
          <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
        )}
        {isError && (
          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Connection error
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-4 w-32 animate-pulse rounded bg-[hsl(var(--color-border)/40%)]" />
      ) : loadError ? (
        <p className="mt-4 text-xs text-red-500">{loadError}</p>
      ) : isError ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-red-600">
            Wholo lost access to your Xero organisation. Reconnect to restore syncing.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Reconnect Xero'}
          </button>
        </div>
      ) : isConnected && connection ? (
        <div className="mt-4 space-y-3">
          <dl className="space-y-1 text-xs text-muted">
            <div className="flex gap-1.5">
              <dt className="font-medium text-text">Organisation:</dt>
              <dd>{connection.externalOrganisationName}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium text-text">Connected:</dt>
              <dd>{new Date(connection.connectedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/integrations/accounting"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              View synced data
              {needsAttentionCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">
                  {needsAttentionCount}
                </span>
              )}
              <span aria-hidden>→</span>
            </Link>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-[hsl(var(--color-border)/10%)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Connect Xero'}
          </button>
        </div>
      )}

      {actionError && <p className="mt-3 text-xs text-red-500">{actionError}</p>}
    </div>
  );
}
