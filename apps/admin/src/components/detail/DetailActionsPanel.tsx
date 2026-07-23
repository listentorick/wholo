'use client';

import { useState } from 'react';
import Link from 'next/link';

export type ActionTone = 'primary' | 'secondary' | 'danger';

export interface ActionItem {
  key: string;
  label: string;
  tone?: ActionTone;
  /** 'submit' for a native form submit button; 'button' (default) for an imperative onClick. Ignored when `href` is set. */
  type?: 'submit' | 'button';
  href?: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Requires a second click ("are you sure?") before onClick fires — used for deletes/deactivations. */
  confirm?: {
    /** Helper text shown above the button, before it's clicked. */
    description?: string;
    /** Prompt shown once the user clicks, before they confirm. Defaults to "Are you sure?". */
    prompt?: string;
    confirmLabel?: string;
  };
}

interface DetailActionsPanelProps {
  actions: ActionItem[];
  layout: 'sidebar' | 'footer';
  banner?: { success?: string | null; error?: string | null };
}

const PRIMARY_CLS =
  'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
const SIDEBAR_SECONDARY_CLS =
  'rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50';
const FOOTER_SECONDARY_CLS =
  'rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50';

function mainActionClassName(tone: ActionTone, layout: 'sidebar' | 'footer') {
  if (tone === 'primary') return `${PRIMARY_CLS} ${layout === 'sidebar' ? 'w-full' : ''}`;
  return `${layout === 'sidebar' ? SIDEBAR_SECONDARY_CLS : FOOTER_SECONDARY_CLS} ${layout === 'sidebar' ? 'w-full' : ''}`;
}

function MainAction({ action, layout }: { action: ActionItem; layout: 'sidebar' | 'footer' }) {
  const tone = action.tone ?? 'secondary';
  const className = mainActionClassName(tone, layout).trim();
  const label = action.loading ? action.loadingLabel ?? action.label : action.label;

  if (action.href) {
    return (
      <Link
        href={action.href}
        className={`${className} inline-flex items-center justify-center ${action.disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      type={action.type ?? 'button'}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className={className}
    >
      {label}
    </button>
  );
}

function DangerAction({ action }: { action: ActionItem }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-white p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Danger zone</h3>
      {action.confirm?.description && (
        <p className="mb-3 text-xs text-muted">{action.confirm.description}</p>
      )}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={action.disabled}
          className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action.label}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-red-600">{action.confirm?.prompt ?? 'Are you sure?'}</p>
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.loading}
            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action.loading ? action.loadingLabel ?? 'Deleting…' : action.confirm?.confirmLabel ?? 'Yes, delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function DetailActionsPanel({ actions, layout, banner }: DetailActionsPanelProps) {
  const mainActions = actions.filter((a) => (a.tone ?? 'secondary') !== 'danger');
  const dangerActions = actions.filter((a) => a.tone === 'danger');

  if (layout === 'footer') {
    return (
      <>
        {banner?.error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {banner.error}
          </div>
        )}
        {banner?.success && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {banner.success}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-5">
          {dangerActions.map((action) => (
            <div key={action.key} className="mr-auto">
              <MainAction action={{ ...action, tone: 'secondary' }} layout="footer" />
            </div>
          ))}
          {mainActions.map((action) => (
            <MainAction key={action.key} action={action} layout="footer" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-lg border border-border bg-white p-4">
        {mainActions.map((action) => (
          <MainAction key={action.key} action={action} layout="sidebar" />
        ))}
        {banner?.success && <p className="text-xs font-medium text-green-600">{banner.success}</p>}
        {banner?.error && <p className="text-xs font-medium text-red-500">{banner.error}</p>}
      </div>
      {dangerActions.map((action) => (
        <DangerAction key={action.key} action={action} />
      ))}
    </>
  );
}
