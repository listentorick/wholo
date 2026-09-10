'use client';

import Link from 'next/link';

export interface StorefrontSection {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  sections: StorefrontSection[];
  activeSection: string;
  onSelectSection: (id: string) => void;
}

const TAB_BASE =
  'inline-flex flex-shrink-0 items-center border-b-[3px] px-4 py-3 text-sm font-medium transition-colors';

/**
 * The distributor tab bar. Catalogue / About / Delivery & terms are in-page
 * scroll anchors (buttons driving the scroll-spy); Orders is a real route link
 * to the per-supplier order history. The active anchor gets the Cobalt underline
 * (never amber — the Warm Spark Rule).
 */
export function StorefrontTabs({ slug, sections, activeSection, onSelectSection }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] items-center overflow-x-auto whitespace-nowrap px-1 md:px-6">
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
            {section.label}
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
