'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

function formatSyncCaption(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Waiting for review since you connected';
  return `Waiting for review since your last sync on ${new Date(lastSyncedAt).toLocaleDateString()}`;
}

function SyncStatChip({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-md bg-accent/10 px-2.5 py-2 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-accent">{count}</p>
    </div>
  );
}

export function XeroConnectionCard() {
  const [connection, setConnection] = useState<AccountingConnectionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [contactsNeedsAttentionCount, setContactsNeedsAttentionCount] = useState(0);
  const [productsNeedsAttentionCount, setProductsNeedsAttentionCount] = useState(0);
  const [taxTypesNeedsAttentionCount, setTaxTypesNeedsAttentionCount] = useState(0);

  useEffect(() => {
    adminAccountingApi
      .getConnection()
      .then((res) => setConnection(res ?? null))
      .catch(() => setLoadError('Failed to load connection status.'))
      .finally(() => setLoading(false));
  }, []);

  const isConnected = connection?.status === 'CONNECTED';
  const isError = connection?.status === 'ERROR';
  const hasAttentionStats =
    contactsNeedsAttentionCount > 0 || productsNeedsAttentionCount > 0 || taxTypesNeedsAttentionCount > 0;

  useEffect(() => {
    if (!isConnected) return;
    adminAccountingApi
      .countContactsNeedingAttention()
      .then((res) => setContactsNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the stat just doesn't show if this fails.
      });
    adminAccountingApi
      .countProductsNeedingAttention()
      .then((res) => setProductsNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the stat just doesn't show if this fails.
      });
    adminAccountingApi
      .countTaxTypesNeedingAttention()
      .then((res) => setTaxTypesNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the stat just doesn't show if this fails.
      });
  }, [isConnected]);

  async function handleConnect() {
    setActionError(null);
    setConnecting(true);
    try {
      const { authorizationUrl } = await adminAccountingApi.createXeroAuthorizationUrl();
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
      await adminAccountingApi.disconnect();
      setConnection(null);
      setContactsNeedsAttentionCount(0);
      setProductsNeedsAttentionCount(0);
      setTaxTypesNeedsAttentionCount(0);
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
            Stocdup lost access to your Xero organisation. Reconnect to restore syncing.
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
          {hasAttentionStats && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">{formatSyncCaption(connection.lastSyncedAt)}</p>
              <div className="grid grid-cols-3 gap-2">
                <SyncStatChip label="Contacts" count={contactsNeedsAttentionCount} />
                <SyncStatChip label="Products" count={productsNeedsAttentionCount} />
                <SyncStatChip label="Tax types" count={taxTypesNeedsAttentionCount} />
              </div>
            </div>
          )}
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
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Link
              href="/integrations/accounting"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              View synced data
              <span aria-hidden>→</span>
            </Link>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
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
