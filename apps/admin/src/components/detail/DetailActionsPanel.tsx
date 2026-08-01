'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '../Modal';

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
  /** Requires confirmation in a modal dialog before onClick fires — used for deletes/deactivations/status changes. */
  confirm?: {
    /** Modal heading. Defaults to the action's `label`. */
    title?: string;
    /** Main question shown in the modal body. */
    prompt?: string;
    /** Optional supporting detail shown below `prompt`. */
    description?: string;
    confirmLabel?: string;
  };
  /**
   * Pulls the action into the separate, singular "Danger zone" card — reserved for
   * genuinely irreversible actions (e.g. delete). Actions that need confirmation
   * but are reversible (suspend, decline) should use `tone: 'danger'` for styling
   * without setting this, so they stay grouped with their peers in the main card.
   */
  dangerZone?: boolean;
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
const SIDEBAR_DANGER_CLS =
  'rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
const DANGER_ZONE_CLS =
  'w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
const MODAL_CANCEL_CLS =
  'rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50';
const MODAL_CONFIRM_DANGER_CLS =
  'rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50';
const MODAL_CONFIRM_PRIMARY_CLS =
  'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

function mainActionClassName(tone: ActionTone, layout: 'sidebar' | 'footer') {
  if (tone === 'primary') return `${PRIMARY_CLS} ${layout === 'sidebar' ? 'w-full' : ''}`;
  if (tone === 'danger' && layout === 'sidebar') return `${SIDEBAR_DANGER_CLS} w-full`;
  return `${layout === 'sidebar' ? SIDEBAR_SECONDARY_CLS : FOOTER_SECONDARY_CLS} ${layout === 'sidebar' ? 'w-full' : ''}`;
}

/** A regular action button — hrefs behave as links; onClick actions route through `onTrigger`
 *  so confirm-requiring actions can open the shared modal instead of firing immediately. */
function MainAction({
  action,
  layout,
  onTrigger,
}: {
  action: ActionItem;
  layout: 'sidebar' | 'footer';
  onTrigger: (action: ActionItem) => void;
}) {
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
      onClick={() => onTrigger(action)}
      disabled={action.disabled || action.loading}
      className={className}
    >
      {label}
    </button>
  );
}

function DangerZoneAction({ action, onTrigger }: { action: ActionItem; onTrigger: (action: ActionItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onTrigger(action)}
      disabled={action.disabled || action.loading}
      className={DANGER_ZONE_CLS}
    >
      {action.loading ? action.loadingLabel ?? action.label : action.label}
    </button>
  );
}

function DangerZoneCard({ actions, onTrigger }: { actions: ActionItem[]; onTrigger: (action: ActionItem) => void }) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-red-600">Danger zone</h3>
      {actions.map((action) => (
        <DangerZoneAction key={action.key} action={action} onTrigger={onTrigger} />
      ))}
    </div>
  );
}

function ConfirmModal({ action, onCancel }: { action: ActionItem; onCancel: () => void }) {
  const confirm = action.confirm!;
  const tone = action.tone ?? 'secondary';
  const confirmClassName = tone === 'danger' ? MODAL_CONFIRM_DANGER_CLS : MODAL_CONFIRM_PRIMARY_CLS;

  return (
    <Modal onClose={onCancel} labelledBy="confirm-modal-title" closable={!action.loading}>
      <h3 id="confirm-modal-title" className="text-base font-semibold text-text">
        {confirm.title ?? action.label}
      </h3>
      {confirm.prompt && <p className="mt-2 text-sm text-text">{confirm.prompt}</p>}
      {confirm.description && <p className="mt-2 text-xs text-muted">{confirm.description}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-modal-cancel
          onClick={onCancel}
          disabled={action.loading}
          className={MODAL_CANCEL_CLS}
        >
          Cancel
        </button>
        <button type="button" onClick={action.onClick} disabled={action.loading} className={confirmClassName}>
          {action.loading ? action.loadingLabel ?? 'Working…' : confirm.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}

export function DetailActionsPanel({ actions, layout, banner }: DetailActionsPanelProps) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const mainActions = actions.filter((a) => !a.dangerZone);
  const dangerZoneActions = actions.filter((a) => a.dangerZone);
  const confirmingAction = actions.find((a) => a.key === confirmingKey) ?? null;

  function trigger(action: ActionItem) {
    if (action.confirm) {
      setConfirmingKey(action.key);
    } else {
      action.onClick?.();
    }
  }

  const modal = confirmingAction && (
    <ConfirmModal action={confirmingAction} onCancel={() => setConfirmingKey(null)} />
  );

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
          {dangerZoneActions.map((action) => (
            <div key={action.key} className="mr-auto">
              <MainAction action={{ ...action, tone: 'secondary' }} layout="footer" onTrigger={trigger} />
            </div>
          ))}
          {mainActions.map((action) => (
            <MainAction key={action.key} action={action} layout="footer" onTrigger={trigger} />
          ))}
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-lg border border-border bg-white p-4">
        {mainActions.map((action) => (
          <MainAction key={action.key} action={action} layout="sidebar" onTrigger={trigger} />
        ))}
        {banner?.success && <p className="text-xs font-medium text-green-600">{banner.success}</p>}
        {banner?.error && <p className="text-xs font-medium text-red-500">{banner.error}</p>}
      </div>
      <DangerZoneCard actions={dangerZoneActions} onTrigger={trigger} />
      {modal}
    </>
  );
}
