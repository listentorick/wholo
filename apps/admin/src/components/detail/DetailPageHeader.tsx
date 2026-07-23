import { PageHeading } from '@/components/PageHeading';
import { DetailBreadcrumb } from './DetailBreadcrumb';

interface DetailPageHeaderProps {
  /** Full-page mode: renders a breadcrumb back-link on its own line above the heading. */
  backHref?: string;
  backLabel?: string;
  /** Drawer mode: renders a close button inline with the heading instead of a breadcrumb. */
  onClose?: () => void;
  heading: React.ReactNode;
  /** 'accent' wraps the heading in PageHeading (used for create-mode generic titles); 'plain' renders a bare h1 (used for edit-mode entity names). Defaults to 'plain'. */
  headingStyle?: 'accent' | 'plain';
  size?: 'lg' | 'xl';
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function DetailPageHeader({
  backHref,
  backLabel,
  onClose,
  heading,
  headingStyle = 'plain',
  size = 'xl',
  badge,
  actions,
}: DetailPageHeaderProps) {
  const headingEl =
    headingStyle === 'accent' ? (
      <PageHeading size={size}>{heading}</PageHeading>
    ) : (
      <h1 className={`${size === 'lg' ? 'text-lg' : 'text-xl'} font-semibold text-text`}>{heading}</h1>
    );

  const row = (
    <div className="flex items-center gap-3 flex-wrap">
      {headingEl}
      {badge}
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </div>
  );

  if (onClose) {
    return (
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {headingEl}
        {badge}
        {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="mb-6">
      {backHref && (
        <div className="mb-3">
          <DetailBreadcrumb href={backHref} label={backLabel ?? 'Back'} />
        </div>
      )}
      {row}
    </div>
  );
}
