'use client';

interface Props {
  onBack?: () => void;
  /** Skip advances without saving. Omit to hide the skip action. */
  onSkip?: () => void;
  /** Label of the primary (submit) button. */
  nextLabel?: string;
  saving?: boolean;
  error?: string | null;
  /** When set, the primary button is a plain button calling this instead of submitting a form. */
  onNext?: () => void;
}

export function WizardStepFooter({ onBack, onSkip, nextLabel = 'Save & continue', saving, error, onNext }: Props) {
  // Card-footer chrome, matching the customer wizard's step footers.
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            ← Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs font-medium text-red-500">{error}</span>}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Skip for now
          </button>
        )}
        <button
          type={onNext ? 'button' : 'submit'}
          onClick={onNext}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : nextLabel}
        </button>
      </div>
    </div>
  );
}
