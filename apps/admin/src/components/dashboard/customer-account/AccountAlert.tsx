'use client';

import { useState } from 'react';
import { ConfirmModal, type ActionItem } from '@/components/detail/DetailActionsPanel';

interface Props {
  title: string;
  detail: string;
  /** The page's own actions ("Raise limit", "Suspend ordering"), so a confirmation works the same here as in the sidebar. */
  actions: ActionItem[];
}

// The account's warning: over the credit limit, or something overdue, with
// what to do about it.
export function AccountAlert({ title, detail, actions }: Props) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const confirming = actions.find((a) => a.key === confirmingKey) ?? null;

  return (
    <section aria-label="Account alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <div className="flex min-w-0 flex-[1_1_420px] items-start gap-3">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C8242B" strokeWidth="2" className="mt-px flex-none">
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v5M12 18v.5" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">{title}</p>
          <p className="text-sm text-red-800">{detail}</p>
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled || action.loading}
              onClick={() => (action.confirm ? setConfirmingKey(action.key) : action.onClick?.())}
              className={`min-h-11 rounded-md border bg-white px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                action.tone === 'danger' ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-border text-text hover:bg-border/20'
              }`}
            >
              {action.loading ? action.loadingLabel ?? action.label : action.label}
            </button>
          ))}
        </div>
      )}
      {confirming && <ConfirmModal action={confirming} onCancel={() => setConfirmingKey(null)} />}
    </section>
  );
}
