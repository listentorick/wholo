'use client';

import Link from 'next/link';

export interface StorefrontSection {
  id: string;
  label: string;
  /** Shorter label used where space is tight (mobile). Falls back to `label`. */
  shortLabel?: string;
}

/** The storefront's in-page sections, in document order. */
export const STOREFRONT_SECTIONS: StorefrontSection[] = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'about', label: 'About' },
  { id: 'delivery', label: 'Delivery & terms', shortLabel: 'Delivery' },
];

/**
 * Tab behaviour:
 * - `spy`  — on the storefront itself: the section tabs are buttons that
 *   scroll-spy / scroll-to, driven by `useScrollSpy`.
 * - `link` — on sub-pages (product detail, …): the section tabs are links back
 *   to `/{slug}#{id}`.
 */
export type StorefrontTabsConfig =
  | {
      mode: 'spy';
      activeSection: string;
      onSelectSection: (id: string) => void;
    }
  | { mode: 'link'; activeSection?: string };

interface Props {
  slug: string;
  sections: StorefrontSection[];
  tabs: StorefrontTabsConfig;
}

const TAB_BASE =
  'flex flex-1 items-center justify-center whitespace-nowrap border-b-[3px] px-1.5 py-3 text-sm font-medium transition-colors md:flex-none md:justify-start md:px-4';

function TabLabel({ section }: { section: StorefrontSection }) {
  if (section.shortLabel && section.shortLabel !== section.label) {
    return (
      <>
        <span className="md:hidden">{section.shortLabel}</span>
        <span className="hidden md:inline">{section.label}</span>
      </>
    );
  }
  return <>{section.label}</>;
}

/**
 * The distributor tab bar. Catalogue / About / Delivery & terms are the in-page
 * sections; Orders is always a route link to the per-supplier order history. The
 * active anchor gets the Cobalt underline (never amber — the Warm Spark Rule).
 */
export function StorefrontTabs({ slug, sections, tabs }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] items-center md:px-6">
      {sections.map((section) => {
        if (tabs.mode === 'link') {
          const active = tabs.activeSection === section.id;
          return (
            <Link
              key={section.id}
              href={`/${slug}#${section.id}`}
              aria-current={active ? 'true' : undefined}
              className={`${TAB_BASE} ${
                active
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <TabLabel section={section} />
            </Link>
          );
        }
        const active = tabs.activeSection === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => tabs.onSelectSection(section.id)}
            aria-current={active ? 'true' : undefined}
            className={`${TAB_BASE} ${
              active
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <TabLabel section={section} />
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
