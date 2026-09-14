'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * "Ordering on behalf of {customer}" bar shown while a distributor admin is
 * impersonating a trade customer (see `OrderAsHandler`). Sticks to the very top
 * of the shell above the storefront's own sticky block, and publishes its height
 * as `--orderas-h` so the shop block can offset itself beneath it.
 */
export function OrderAsBanner() {
  const { orderAsMode, orderAsCustomerName, endOrderAsSession } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!orderAsMode || !ref.current) {
      root.style.setProperty('--orderas-h', '0px');
      return;
    }
    const el = ref.current;
    const publish = () => root.style.setProperty('--orderas-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--orderas-h', '0px');
    };
  }, [orderAsMode]);

  if (!orderAsMode) return null;

  return (
    <div
      ref={ref}
      className="sticky top-0 z-40 flex items-center justify-between gap-4 bg-amber px-4 py-2 text-sm font-medium text-amber-fg"
    >
      <span className="truncate">Ordering on behalf of {orderAsCustomerName}</span>
      <button
        disabled={ending}
        onClick={() => {
          setEnding(true);
          endOrderAsSession().catch(() => {}).finally(() => setEnding(false));
        }}
        className="flex-shrink-0 rounded border border-amber-fg/40 px-3 py-1 text-xs transition-colors hover:bg-amber-fg/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ending ? 'Ending…' : 'End session'}
      </button>
    </div>
  );
}
