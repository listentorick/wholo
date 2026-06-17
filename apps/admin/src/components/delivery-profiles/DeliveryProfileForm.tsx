'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type {
  DeliveryProfile,
  DeliveryProfileCutoffRule,
  CreateDeliveryProfileRequest,
  UpdateDeliveryProfileRequest,
  CreateDeliveryProfileCutoffRuleRequest,
} from '@wholo/types';
import { FormCard, FieldLabel, TextInput, SaveButton, SaveBanner } from '@/components/settings/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { value: 0, short: 'Sun', label: 'Sunday' },
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
];

function weekdayLabel(n: number) {
  return WEEKDAYS.find((w) => w.value === n)?.label ?? String(n);
}

function isoDate(s: string) {
  return s.slice(0, 10);
}

// ─── Cutoff rule row ──────────────────────────────────────────────────────────

function CutoffRuleRow({
  profileId,
  rule,
  token,
  onDeleted,
  onUpdated,
}: {
  profileId: string;
  rule: DeliveryProfileCutoffRule;
  token: string;
  onDeleted: (id: string) => void;
  onUpdated: (r: DeliveryProfileCutoffRule) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cutoffTime, setCutoffTime] = useState(rule.cutoffTime);
  const [processingDays, setProcessingDays] = useState(String(rule.processingDaysBeforeDelivery));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await adminDeliveryProfilesApi.updateCutoffRule(token, profileId, rule.id, {
        cutoffTime,
        processingDaysBeforeDelivery: Number(processingDays),
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await adminDeliveryProfilesApi.deleteCutoffRule(token, profileId, rule.id);
    onDeleted(rule.id);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2.5">
        <span className="text-sm text-text">
          <span className="font-medium">{weekdayLabel(rule.weekday)}</span>
          <span className="ml-2 text-muted">order by {rule.cutoffTime}, {rule.processingDaysBeforeDelivery} processing day{rule.processingDaysBeforeDelivery !== 1 ? 's' : ''} before</span>
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Edit</button>
          <button type="button" onClick={remove} className="text-xs text-red-500 hover:underline">Remove</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3 space-y-2">
      <span className="text-sm font-medium text-text">{weekdayLabel(rule.weekday)}</span>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <FieldLabel>Cut-off time</FieldLabel>
          <TextInput type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} />
        </div>
        <div className="w-32">
          <FieldLabel>Processing days before</FieldLabel>
          <TextInput type="number" min={0} max={14} value={processingDays} onChange={(e) => setProcessingDays(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mb-px rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="mb-px text-sm text-muted hover:text-text">Cancel</button>
      </div>
    </div>
  );
}

// ─── Add cutoff rule form ─────────────────────────────────────────────────────

function AddCutoffRuleForm({
  profileId,
  token,
  existingWeekdays,
  onAdded,
  onCancel,
}: {
  profileId: string;
  token: string;
  existingWeekdays: number[];
  onAdded: (r: DeliveryProfileCutoffRule) => void;
  onCancel: () => void;
}) {
  const available = WEEKDAYS.filter((w) => !existingWeekdays.includes(w.value));
  const [weekday, setWeekday] = useState(String(available[0]?.value ?? 1));
  const [cutoffTime, setCutoffTime] = useState('17:00');
  const [processingDays, setProcessingDays] = useState('1');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const rule = await adminDeliveryProfilesApi.createCutoffRule(token, profileId, {
        weekday: Number(weekday),
        cutoffTime,
        processingDaysBeforeDelivery: Number(processingDays),
      });
      onAdded(rule);
    } finally {
      setSaving(false);
    }
  }

  if (available.length === 0) return null;

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-[#fafafa] px-3 py-3 space-y-2">
      <div className="flex gap-3 items-end">
        <div className="w-32">
          <FieldLabel>Weekday</FieldLabel>
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {available.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <FieldLabel>Cut-off time</FieldLabel>
          <TextInput type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} required />
        </div>
        <div className="w-32">
          <FieldLabel>Processing days before</FieldLabel>
          <TextInput type="number" min={0} max={14} value={processingDays} onChange={(e) => setProcessingDays(e.target.value)} required />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mb-px rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="mb-px text-sm text-muted hover:text-text">Cancel</button>
      </div>
    </form>
  );
}

// ─── Date exceptions picker ───────────────────────────────────────────────────

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const startCol = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(startCol).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function MonthGrid({
  year,
  month,
  defaultWeekdays,
  enabledDates,
  disabledDates,
  onToggle,
}: {
  year: number;
  month: number;
  defaultWeekdays: number[];
  enabledDates: string[];
  disabledDates: string[];
  onToggle: (iso: string) => void;
}) {
  const rows = buildMonthGrid(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 text-center text-sm font-semibold text-text">{monthLabel}</div>
      <div className="grid grid-cols-7">
        {DAY_HEADERS.map((h, i) => (
          <div
            key={h}
            className={['text-center text-xs font-medium py-1', defaultWeekdays.includes(i) ? 'text-primary' : 'text-muted'].join(' ')}
          >
            {h}
          </div>
        ))}
        {rows.map((row, ri) =>
          row.map((d, ci) => {
            if (!d) return <div key={`${ri}-${ci}`} />;
            const iso = toIso(d);
            const isEnabled = enabledDates.includes(iso);
            const isDisabled = disabledDates.includes(iso);
            const isDefault = defaultWeekdays.includes(d.getDay());

            const cellBg = isDefault && !isEnabled && !isDisabled ? 'bg-primary/10' : '';
            const circleCls = isEnabled
              ? 'bg-primary text-white font-semibold rounded-full'
              : isDisabled
              ? 'bg-primary/20 text-primary/50 rounded-full'
              : 'hover:bg-border/40 rounded-full';

            return (
              <div key={iso} className={['flex items-center justify-center py-0.5', cellBg].join(' ')}>
                <button
                  type="button"
                  onClick={() => onToggle(iso)}
                  className={['h-7 w-7 text-xs transition-colors cursor-pointer', circleCls].join(' ')}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DateExceptionsPicker({
  defaultWeekdays,
  enabledDates,
  disabledDates,
  onEnabledChange,
  onDisabledChange,
}: {
  defaultWeekdays: number[];
  enabledDates: string[];
  disabledDates: string[];
  onEnabledChange: (dates: string[]) => void;
  onDisabledChange: (dates: string[]) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleToggle(iso: string) {
    if (enabledDates.includes(iso)) {
      onEnabledChange(enabledDates.filter((d) => d !== iso));
      onDisabledChange([...disabledDates, iso].sort());
    } else if (disabledDates.includes(iso)) {
      onDisabledChange(disabledDates.filter((d) => d !== iso));
    } else {
      onEnabledChange([...enabledDates, iso].sort());
    }
  }

  function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  return (
    <div className="space-y-4">
      {/* Two-month calendar */}
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={prevMonth}
          className="mt-6 rounded p-1 hover:bg-border/40 text-muted hover:text-text flex-shrink-0"
          aria-label="Previous month"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex flex-1 gap-4 overflow-hidden">
          <MonthGrid
            year={viewYear}
            month={viewMonth}
            defaultWeekdays={defaultWeekdays}
            enabledDates={enabledDates}
            disabledDates={disabledDates}
            onToggle={handleToggle}
          />
          <div className="hidden md:block w-px bg-border flex-shrink-0" />
          <div className="hidden md:flex flex-1 min-w-0">
            <MonthGrid
              year={rightYear}
              month={rightMonth}
              defaultWeekdays={defaultWeekdays}
              enabledDates={enabledDates}
              disabledDates={disabledDates}
              onToggle={handleToggle}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          className="mt-6 rounded p-1 hover:bg-border/40 text-muted hover:text-text flex-shrink-0"
          aria-label="Next month"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary/10 border border-primary/20" />
          Default delivery day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary" />
          Specially enabled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary/20" />
          Specially disabled
        </span>
      </div>

      {/* Date lists */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
        <div>
          <p className="mb-2 text-xs font-semibold text-text">Specially enabled dates</p>
          {enabledDates.length === 0 ? (
            <p className="text-xs text-muted">None</p>
          ) : (
            <div className="space-y-1">
              {enabledDates.map((iso) => (
                <div key={iso} className="flex items-center justify-between rounded border border-border bg-white px-2 py-1.5">
                  <span className="text-xs text-text">{formatDate(iso)}</span>
                  <button
                    type="button"
                    onClick={() => onEnabledChange(enabledDates.filter((d) => d !== iso))}
                    className="ml-2 text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-text">Specially disabled dates</p>
          {disabledDates.length === 0 ? (
            <p className="text-xs text-muted">None</p>
          ) : (
            <div className="space-y-1">
              {disabledDates.map((iso) => (
                <div key={iso} className="flex items-center justify-between rounded border border-border bg-white px-2 py-1.5">
                  <span className="text-xs text-text">{formatDate(iso)}</span>
                  <button
                    type="button"
                    onClick={() => onDisabledChange(disabledDates.filter((d) => d !== iso))}
                    className="ml-2 text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  profile?: DeliveryProfile;
  token: string;
}

export function DeliveryProfileForm({ profile, token }: Props) {
  const router = useRouter();
  const isNew = !profile;

  const [name, setName] = useState(profile?.name ?? '');
  const [active, setActive] = useState(profile?.active ?? true);
  const [defaultWeekdays, setDefaultWeekdays] = useState<number[]>(profile?.defaultWeekdays ?? []);
  const [defaultCutoffTime, setDefaultCutoffTime] = useState(profile?.defaultCutoffTime ?? '17:00');
  const [defaultCutoffDays, setDefaultCutoffDays] = useState(String(profile?.defaultCutoffProcessingDays ?? 1));
  const [enabledDates, setEnabledDates] = useState<string[]>(profile?.speciallyEnabledDates ?? []);
  const [disabledDates, setDisabledDates] = useState<string[]>(profile?.speciallyDisabledDates ?? []);
  const [cutoffRules, setCutoffRules] = useState<DeliveryProfileCutoffRule[]>(profile?.cutoffRules ?? []);
  const [showAddRule, setShowAddRule] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function toggleWeekday(day: number) {
    setDefaultWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setSuccess(false);
    setSaveError(null);

    const payload: CreateDeliveryProfileRequest & UpdateDeliveryProfileRequest = {
      name: name.trim(),
      active,
      defaultWeekdays,
      defaultCutoffTime,
      defaultCutoffProcessingDays: Number(defaultCutoffDays),
      speciallyEnabledDates: enabledDates,
      speciallyDisabledDates: disabledDates,
    };

    try {
      if (isNew) {
        const created = await adminDeliveryProfilesApi.create(token, payload);
        router.push(`/delivery-profiles/${created.id}/edit`);
      } else {
        await adminDeliveryProfilesApi.update(token, profile.id, payload);
        setSuccess(true);
      }
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    setIsDeleting(true);
    try {
      await adminDeliveryProfilesApi.delete(token, profile.id);
      router.push('/delivery-profiles');
    } finally {
      setIsDeleting(false);
    }
  }

  const handleRuleAdded = useCallback((rule: DeliveryProfileCutoffRule) => {
    setCutoffRules((prev) => [...prev, rule].sort((a, b) => a.weekday - b.weekday));
    setShowAddRule(false);
  }, []);

  const handleRuleDeleted = useCallback((id: string) => {
    setCutoffRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleRuleUpdated = useCallback((rule: DeliveryProfileCutoffRule) => {
    setCutoffRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-6">
        {/* Left column — form sections */}
        <div className="space-y-5">

          {/* Name & status */}
          <FormCard title="Profile details">
            <div className="space-y-4">
              <div>
                <FieldLabel htmlFor="name">Profile name</FieldLabel>
                <TextInput
                  id="name"
                  placeholder="e.g. Western Suburbs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-text">Active</span>
              </label>
            </div>
          </FormCard>

          {/* Delivery days + date exceptions */}
          <FormCard title="Delivery days" description="Set the days normally available for delivery and any date-specific exceptions.">
            <div className="space-y-6">
              <div>
                <FieldLabel>Default delivery days</FieldLabel>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WEEKDAYS.map(({ value, short, label }) => {
                    const active = defaultWeekdays.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleWeekday(value)}
                        title={label}
                        className={[
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-white text-muted hover:border-primary/50 hover:text-text',
                        ].join(' ')}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <DateExceptionsPicker
                  defaultWeekdays={defaultWeekdays}
                  enabledDates={enabledDates}
                  disabledDates={disabledDates}
                  onEnabledChange={setEnabledDates}
                  onDisabledChange={setDisabledDates}
                />
              </div>
            </div>
          </FormCard>

          {/* Cut-off rules */}
          <FormCard title="Order cut-off" description="Set the default order deadline and optionally override it per delivery day.">
            <div className="space-y-6">
              <div>
                <FieldLabel>Default cut-off rule</FieldLabel>
                <p className="mb-2 text-xs text-muted">Applies to all delivery days that don't have a per-day override.</p>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <FieldLabel htmlFor="cutoffTime">Cut-off time</FieldLabel>
                    <TextInput
                      id="cutoffTime"
                      type="time"
                      value={defaultCutoffTime}
                      onChange={(e) => setDefaultCutoffTime(e.target.value)}
                    />
                  </div>
                  <div className="w-48">
                    <FieldLabel htmlFor="cutoffDays">Processing days before delivery</FieldLabel>
                    <TextInput
                      id="cutoffDays"
                      type="number"
                      min={0}
                      max={14}
                      value={defaultCutoffDays}
                      onChange={(e) => setDefaultCutoffDays(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {!isNew && (
                <div className="border-t border-border pt-5">
                  <FieldLabel>Per-day cut-off overrides</FieldLabel>
                  <p className="mb-3 text-xs text-muted">Optional overrides for specific delivery days.</p>
                  <div className="space-y-2">
                    {cutoffRules.length === 0 && !showAddRule && (
                      <p className="text-sm text-muted">No overrides yet — all days use the default.</p>
                    )}
                    {cutoffRules.map((rule) => (
                      <CutoffRuleRow
                        key={rule.id}
                        profileId={profile!.id}
                        rule={rule}
                        token={token}
                        onDeleted={handleRuleDeleted}
                        onUpdated={handleRuleUpdated}
                      />
                    ))}
                    {showAddRule ? (
                      <AddCutoffRuleForm
                        profileId={profile!.id}
                        token={token}
                        existingWeekdays={cutoffRules.map((r) => r.weekday)}
                        onAdded={handleRuleAdded}
                        onCancel={() => setShowAddRule(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddRule(true)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add override
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </FormCard>

        </div>

        {/* Right column — actions */}
        <div className="mt-5 lg:mt-0">
          <div className="sticky top-6 space-y-4">
            <div className="rounded-lg border border-border bg-white p-4 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : isNew ? 'Create profile' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/delivery-profiles')}
                className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
              >
                Back
              </button>
              <SaveBanner success={success} error={saveError} />
            </div>

            {!isNew && (
              <div className="rounded-lg border border-red-200 bg-white p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Danger zone</h3>
                <p className="mb-3 text-xs text-muted">Deactivates this profile. Customers will have no delivery dates available.</p>
                {showDeleteConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-red-600">Are you sure?</p>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-border/20"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Delete profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
