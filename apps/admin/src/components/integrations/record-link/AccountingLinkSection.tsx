'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@wholo/admin-api-client';
import { Permission, type AccountingRecordLink } from '@wholo/types';
import { useCan } from '@/lib/permissions';
import { useIngestionSync } from '@/lib/ingestion-sync-context';
import { relativeTime } from '@/lib/date';
import { accountingProviderLogo } from '@/lib/accounting-provider-logos';
import {
  BUTTON_DANGER_CLS,
  BUTTON_PRIMARY_CLS,
  BUTTON_SECONDARY_CLS,
  ConfirmModal,
} from '@/components/detail/DetailActionsPanel';
import { FormCard, TextInput } from '@/components/form';
import { STATUS_TONE_STYLES } from '@/components/list/StatusBadge';
import { SyncWithProviderButton } from '@/components/integrations/SyncWithProviderButton';
import { TaxTypeConflictModal } from '@/components/integrations/products/TaxTypeConflictModal';
import { matchMethodLabel, type LinkSearchResult, type RecordLinkConfig } from './record-link-config';

interface Props<TExternal extends { id: string; displayName: string }> {
  config: RecordLinkConfig<TExternal>;
  link: AccountingRecordLink<TExternal, string> & { connection: NonNullable<AccountingRecordLink<TExternal, string>['connection']> };
  /** What this record type's match route links to (trade relationship / product id). */
  matchTargetId: string;
  /** The record's own name and identity, for the suggestion comparison. */
  record: { displayName: string; rows: { label: string; value: string | null }[] };
  onChanged: () => Promise<void> | void;
}

const CHANGED_TONE = STATUS_TONE_STYLES.yellow;
const WARNING_TONE = STATUS_TONE_STYLES.orange;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isTaxConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && err.problem.title === 'TAX_TYPE_CONFLICT';
}

// One card in the Integrations tab: this record's link to the connected
// accounting system. Draws linked / changed / not linked from the record-link
// lookup; every action is an existing accounting route via `config`.
export function AccountingLinkSection<TExternal extends { id: string; displayName: string }>({
  config,
  link,
  matchTargetId,
  record,
  onChanged,
}: Props<TExternal>) {
  const canImport = useCan()(Permission.ACCOUNTING_IMPORT);
  // Every action needs a working connection; one in error would fail them all.
  const connected = link.connection.status === 'CONNECTED';
  const canAct = canImport && connected;
  const { triggerSync, isSyncing } = useIngestionSync();
  const providerName = link.connection.providerName;
  const providerLogo = accountingProviderLogo(link.connection.provider);
  const noun = config.externalNoun;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  // The action to resubmit with the override once the user confirms it.
  const [taxConflict, setTaxConflict] = useState<{ detail: string; retry: () => Promise<void> } | null>(null);

  // Whether the action worked is decided by `fn` alone. The reload after it
  // is best-effort: a failed reload must not turn a success into an error.
  async function run(action: string, fn: (override: boolean) => Promise<void>, override = false) {
    setBusy(action);
    setError(null);
    try {
      await fn(override);
      setTaxConflict(null);
    } catch (err) {
      if (isTaxConflict(err)) {
        setTaxConflict({
          detail: err.problem.detail ?? 'This link would change the product’s tax type.',
          retry: () => run(action, fn, true),
        });
      } else {
        setTaxConflict(null);
        setError('That didn’t work. Please try again.');
      }
    }
    try {
      await onChanged();
    } catch {
      // The page keeps what it last showed.
    }
    setBusy(null);
  }

  function linkTo(externalId: string) {
    return run('link', (override) => config.match(externalId, matchTargetId, override));
  }

  const active = link.link;

  return (
    <FormCard
      title="Accounting"
      actions={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white py-0.5 pl-0.5 pr-2.5 text-sm font-medium text-text">
            {providerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={providerLogo} alt="" className="h-5 w-5 shrink-0 rounded-full" />
            ) : (
              <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-text text-xs font-bold text-white">
                {providerName.charAt(0).toUpperCase()}
              </span>
            )}
            {providerName}
          </span>
          <span className="text-sm text-muted">
            {link.connection.lastSyncedAt ? `Last synced ${relativeTime(link.connection.lastSyncedAt)}` : 'Not synced yet'}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {canImport && !connected && (
          <p className="text-sm text-text">
            The {providerName} connection needs attention, so links can’t be changed here.{' '}
            <Link href="/integrations/accounting" className="text-primary hover:underline">
              Check it under Integrations › Accounting
            </Link>
            .
          </p>
        )}

        {active && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-green-700">Linked {noun}</div>
                <div className="text-sm font-semibold text-text">{active.external.displayName}</div>
                <IdentityList rows={config.identityRows(active.external)} />
                <p className="text-sm text-muted">
                  Linked {formatDate(active.linkedAt)}
                  {active.linkedBy ? ` by ${active.linkedBy.name}` : ''}
                  {matchMethodLabel(active.matchMethod) ? ` · ${matchMethodLabel(active.matchMethod)}` : ''}
                </p>
              </div>
              {canAct && (
                <div className="flex gap-2">
                  <button type="button" className={BUTTON_DANGER_CLS} onClick={() => setConfirmingUnlink(true)} disabled={busy !== null}>
                    Unlink…
                  </button>
                </div>
              )}
            </div>

            {link.change && (
              <div
                className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3.5 text-sm"
                style={{ backgroundColor: CHANGED_TONE.bg, color: CHANGED_TONE.text }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <b>
                    Changed in {providerName} on {formatDate(link.change.detectedAt)}
                  </b>
                  {canAct && (
                    <button
                      type="button"
                      className={`${BUTTON_SECONDARY_CLS} ml-auto bg-white`}
                      disabled={busy !== null}
                      onClick={() => run('acknowledge', () => config.acknowledgeChange(active.external.id))}
                    >
                      {busy === 'acknowledge' ? 'Acknowledging…' : 'Acknowledge'}
                    </button>
                  )}
                </div>
                <p>The values above are what {providerName} holds now. Check they are still right for this record.</p>
              </div>
            )}
          </>
        )}

        {!active && (
          <div className="flex flex-col gap-1">
            <h3
              className="text-sm font-semibold text-text"
              style={config.notLinked.tone === 'warning' ? { color: WARNING_TONE.text } : undefined}
            >
              Not linked to a {providerName} {noun}
            </h3>
            <p className="text-sm text-text">{config.notLinked.message}</p>
          </div>
        )}

        {!active && link.suggestion && (
          <div className="flex flex-col gap-3 rounded-lg border-2 border-primary px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Suggested match · {link.suggestion.matchReason}
            </div>
            <Comparison
              providerHeading={`${providerName} ${noun}`}
              record={record}
              external={{
                displayName: link.suggestion.external.displayName,
                rows: config.identityRows(link.suggestion.external),
              }}
            />
            {canAct && (
              <div>
                <button
                  type="button"
                  className={BUTTON_PRIMARY_CLS}
                  disabled={busy !== null}
                  onClick={() => run('confirm', (override) => config.confirmSuggestion(link.suggestion!.id, override))}
                >
                  {busy === 'confirm' ? 'Linking…' : `Link to this ${noun}`}
                </button>
              </div>
            )}
          </div>
        )}

        {canAct && !active && (
          <LinkSearch
            config={config}
            providerName={providerName}
            heading={link.suggestion ? `Or find the ${noun} yourself` : `Find the ${noun}`}
            busy={busy === 'link'}
            disabled={busy !== null}
            onLink={linkTo}
            sync={{ onClick: triggerSync, syncing: isSyncing }}
          />
        )}

        <LinkHistory history={link.history} noun={noun} />
      </div>

      {confirmingUnlink && active && (
        <ConfirmModal
          action={{
            key: 'unlink',
            label: 'Unlink',
            tone: 'danger',
            loading: busy === 'unlink',
            loadingLabel: 'Unlinking…',
            onClick: async () => {
              await run('unlink', () => config.unlink(active.mappingId));
              setConfirmingUnlink(false);
            },
            confirm: {
              title: `Unlink from ${active.external.displayName}?`,
              prompt: `${config.notLinked.message} You can then link a different ${noun}.`,
              confirmLabel: 'Yes, unlink',
            },
          }}
          onCancel={() => setConfirmingUnlink(false)}
        />
      )}

      {taxConflict && (
        <TaxTypeConflictModal
          detail={taxConflict.detail}
          submitting={busy !== null}
          onCancel={() => setTaxConflict(null)}
          onConfirm={() => void taxConflict.retry()}
        />
      )}
    </FormCard>
  );
}

function IdentityList({ rows }: { rows: { label: string; value: string | null; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted">{row.label}</dt>
          <dd className={row.mono ? 'font-mono' : undefined}>{row.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// This record next to the suggested provider record, on the rows both have.
function Comparison({
  providerHeading,
  record,
  external,
}: {
  providerHeading: string;
  record: Props<{ id: string; displayName: string }>['record'];
  external: { displayName: string; rows: { label: string; value: string | null }[] };
}) {
  const theirs = new Map(external.rows.map((r) => [r.label, r.value]));
  const shared = record.rows.filter((r) => theirs.has(r.label));
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="w-24 pb-1.5 font-medium"><span className="sr-only">Field</span></th>
          <th className="pb-1.5 pr-3 font-medium">This record</th>
          <th className="pb-1.5 font-medium">{providerHeading}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-border/60">
          <td className="py-1.5 text-muted">Name</td>
          <td className="py-1.5 pr-3">{record.displayName}</td>
          <td className="py-1.5 font-semibold">{external.displayName}</td>
        </tr>
        {shared.map((row) => (
          <tr key={row.label} className="border-t border-border/60">
            <td className="py-1.5 text-muted">{row.label}</td>
            <td className="py-1.5 pr-3">{row.value ?? '—'}</td>
            <td className="py-1.5">{theirs.get(row.label) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

function LinkSearch<TExternal extends { id: string; displayName: string }>({
  config,
  providerName,
  heading,
  busy,
  disabled,
  onLink,
  sync,
}: {
  config: RecordLinkConfig<TExternal>;
  providerName: string;
  heading: string;
  busy: boolean;
  disabled: boolean;
  onLink: (externalId: string) => Promise<void>;
  sync: { onClick: () => Promise<void>; syncing: boolean };
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      config
        .search(q)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setSearchError(false);
        })
        .catch(() => {
          if (!cancelled) setSearchError(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, query]);

  const inputId = `record-link-search-${config.externalNoun}`;

  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-sm font-semibold text-text">{heading}</h3>
      <label htmlFor={inputId} className="sr-only">
        Search {providerName} {config.externalNoun}s
      </label>
      <TextInput
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
        // The tab can sit inside the record's own form — Enter must not submit it.
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        placeholder={`Search ${providerName} ${config.externalNoun}s by name or code…`}
        autoComplete="off"
      />
      {searchError && <p className="text-sm text-red-600">Search failed. Please try again.</p>}
      {results && results.length === 0 && (
        <p className="text-sm text-muted">
          No matching {providerName} {config.externalNoun}s. {config.searchExcludes} aren’t listed; you can find them
          under Integrations › Accounting.
        </p>
      )}
      {results && results.length > 0 && (
        <div role="radiogroup" aria-label={`${providerName} ${config.externalNoun}s`} className="overflow-hidden rounded-lg border border-border">
          {results.map((r) => (
            <label
              key={r.id}
              className={`flex min-h-[52px] items-center gap-3 border-b border-border/60 px-3.5 text-sm last:border-b-0 ${r.linkedTo ? 'text-muted' : 'cursor-pointer text-text'}`}
            >
              <input
                type="radio"
                name={inputId}
                value={r.id}
                checked={selected === r.id}
                disabled={!!r.linkedTo}
                onChange={() => setSelected(r.id)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{r.displayName}</span>
                <span className="text-xs text-muted">{r.linkedTo ? `Already linked to ${r.linkedTo}` : r.detail}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">Not in {providerName} yet? Add it there, then sync.</span>
        <div className="flex flex-wrap items-center gap-2">
          <SyncWithProviderButton onClick={sync.onClick} disabled={sync.syncing} label="Sync now" />
          <button
            type="button"
            className={BUTTON_PRIMARY_CLS}
            disabled={!selected || disabled}
            onClick={() => selected && void onLink(selected)}
          >
            {busy ? 'Linking…' : 'Link selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Past and current links, newest first; an unlink is its own entry.
function LinkHistory({ history, noun }: { history: AccountingRecordLink<unknown, string>['history']; noun: string }) {
  const events = history
    .flatMap((h) => {
      const how = matchMethodLabel(h.matchMethod);
      const linked = {
        at: h.linkedAt,
        text: `Linked to ${h.externalDisplayName}${h.linkedBy ? ` by ${h.linkedBy.name}` : ''}${how ? ` — ${how}` : ''}`,
      };
      return h.unlinkedAt ? [{ at: h.unlinkedAt, text: `Unlinked from ${h.externalDisplayName}` }, linked] : [linked];
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <details className="border-t border-border/60 pt-3.5 text-sm">
      <summary className="min-h-7 cursor-pointer font-semibold text-text">Link history</summary>
      {events.length === 0 ? (
        <p className="mt-2.5 text-muted">Never linked to a {noun}.</p>
      ) : (
        <ol className="mt-2.5 flex flex-col gap-2">
          {events.map((e, i) => (
            <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
              <span className="text-muted">{formatDate(e.at)}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
