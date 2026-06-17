'use client';

import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { id: 'business', label: 'Business details' },
  { id: 'orders', label: 'Order settings' },
  { id: 'processing-days', label: 'Processing days' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'notifications', label: 'Notifications' },
];

export function SettingsStickyNav() {
  const [active, setActive] = useState('business');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="sticky top-0 z-10 -mx-6 mb-5 border-b border-border bg-surface px-6 py-3">
      <div className="flex gap-1">
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollTo(id)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active === id
                ? 'bg-primary/10 text-primary'
                : 'text-muted hover:bg-[hsl(var(--color-border)/20%)] hover:text-text',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
