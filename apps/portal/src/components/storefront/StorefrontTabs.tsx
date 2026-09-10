'use client';

import Link from 'next/link';

export interface StorefrontSection {
  id: string;
  label: string;
  /** Shorter label used where space is tight (mobile). Falls back to `label`. */
  shortLabel?: string;
}

interface Props {
  slug: string;
  sections: StorefrontSection[];
  activeSection: string;
  onSelectSection: (id: string) => void;
}

// Mobile: tabs split the width evenly (flex-1), no horizontal scroll.
// Desktop: natural width, left-aligned.
const TAB_BASE =
  'flex flex-1 items-center justify-center border-b-[3px] px-2 py-3 text-xs font-medium transition-colors md:flex-none md:justify-start md:px-4 md:text-sm';

/**
 * The distributor tab bar. Catalogue / About / Delivery & terms are in-page
 * scroll anchors (buttons driving the scroll-spy); Orders is a real route link
 * to the per-supplier order history. The active anchor gets the Cobalt underline
 * (never amber — the Warm Spark Rule).
 */
export function StorefrontTabs({ slug, sections, activeSection, onSelectSection }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] items-center md:px-6">
      {sections.map((section) => {
        const active = activeSection === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelectSection(section.id)}
            aria-current={active ? 'true' : undefined}
            className={`${TAB_BASE} ${
              active
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {section.shortLabel && section.shortLabel !== section.label ? (
              <>
                <span className="md:hidden">{section.shortLabel}</span>
                <span className="hidden md:inline">{section.label}</span>
              </>
            ) : (
              section.label
            )}
          </button>
        );
      })}
      <Link
        href={`/${slug}/orders`}
        className={`${TAB_BASE} border-transparent text-muted hover:text-foreground`}
      >
        Orders
      </Link>
    </div>
  );
}
