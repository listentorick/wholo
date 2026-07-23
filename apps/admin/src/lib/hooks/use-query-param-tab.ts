'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useQueryParamTab<TKey extends string>(defaultTab: TKey) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get('tab') as TKey) ?? defaultTab;

  const setTab = useCallback(
    (key: TKey) => {
      router.push(`${pathname}?tab=${key}`);
    },
    [pathname, router],
  );

  return { activeTab, setTab };
}
