'use client';

import { useRef, type ComponentType } from 'react';
import clsx from 'clsx';
import { Beef, Carrot, ChevronLeft, ChevronRight, Coffee, Croissant, Milk } from 'lucide-react';
import { Eyebrow } from '@/components/Eyebrow';

/*
 * TODO(marketplace): EXAMPLE_SUPPLIERS is placeholder data — there is no endpoint
 * that lists distributors a customer is not connected to, no category taxonomy,
 * and no recommendation logic yet (`DistributorSettings.marketplaceVisible` /
 * `marketplaceDescription` are write-only, admin form only). Replace with a real
 * feed when the marketplace directory exists; see the home-page plan follow-ups.
 */
type LucideIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type ExampleSupplier = {
  id: string;
  name: string;
  location: string;
  category: string;
  Icon: LucideIcon;
  /** Tailwind bg for the card's image area. */
  tint: string;
  /** Tailwind bg for the overlapping circular badge. */
  badgeTint: string;
  /** The amber "New supplier" corner ribbon — exactly one entry carries it. */
  isNew?: boolean;
};

const EXAMPLE_SUPPLIERS: ExampleSupplier[] = [
  {
    id: 'ex-highland-dairy',
    name: 'Highland Dairy Co',
    location: 'Lancashire, UK',
    category: 'Dairy & eggs',
    Icon: Milk,
    tint: 'bg-teal-50',
    badgeTint: 'bg-teal-600',
  },
  {
    id: 'ex-greenside-produce',
    name: 'Greenside Produce',
    location: 'Birmingham, UK',
    category: 'Fruit & vegetables',
    Icon: Carrot,
    tint: 'bg-emerald-50',
    badgeTint: 'bg-emerald-600',
  },
  {
    id: 'ex-westmill-bakery',
    name: 'Westmill Bakery',
    location: 'Bristol, UK',
    category: 'Bakery',
    Icon: Croissant,
    tint: 'bg-stone-100',
    badgeTint: 'bg-stone-500',
  },
  {
    id: 'ex-northstar-coffee',
    name: 'Northstar Coffee',
    location: 'Leeds, UK',
    category: 'Drinks',
    Icon: Coffee,
    tint: 'bg-slate-100',
    badgeTint: 'bg-slate-700',
    isNew: true,
  },
  {
    id: 'ex-butchers-choice',
    name: "Butcher's Choice",
    location: 'Manchester, UK',
    category: 'Meat & poultry',
    Icon: Beef,
    tint: 'bg-rose-50',
    badgeTint: 'bg-rose-600',
  },
];

const ARROW =
  'flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent hover:text-accent';

function ExampleCard({ supplier }: { supplier: ExampleSupplier }) {
  const { Icon } = supplier;
  return (
    <div className="w-[190px] flex-shrink-0 rounded-lg border border-border bg-surface">
      <div className={clsx('relative flex h-24 items-center justify-center rounded-t-lg', supplier.tint)}>
        <Icon className="h-9 w-9 text-slate-400" strokeWidth={1.5} />
        {supplier.isNew && (
          <span className="absolute right-0 top-2 bg-amber px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-fg">
            New supplier
          </span>
        )}
        <span
          className={clsx(
            'absolute -bottom-4 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface',
            supplier.badgeTint,
          )}
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={1.75} />
        </span>
      </div>
      <div className="px-3 pb-3 pt-6">
        <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
        <p className="mt-0.5 text-xs text-muted">{supplier.location}</p>
        <p className="text-xs text-muted">{supplier.category}</p>
      </div>
    </div>
  );
}

export function RecommendedSuppliers({ className }: { className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy?.({ left: dir * 220, behavior: 'smooth' });
  };

  return (
    <section
      className={clsx('hm-rise rounded-lg border border-border bg-surface p-5 shadow-sm', className)}
      style={{ animationDelay: '0.18s' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow className="mb-2">Marketplace</Eyebrow>
          <h2 className="text-base font-semibold text-foreground">Recommended suppliers</h2>
        </div>
        <div className="flex flex-shrink-0 gap-1.5">
          <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className={ARROW}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className={ARROW}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {EXAMPLE_SUPPLIERS.map((s) => (
          <ExampleCard key={s.id} supplier={s} />
        ))}
      </div>

      <button
        type="button"
        disabled
        title="Coming soon"
        className="mt-4 text-sm font-medium text-foreground hover:underline disabled:opacity-60"
      >
        Discover suppliers
      </button>
    </section>
  );
}
