'use client';

import { useAuth } from '@/lib/auth-context';

export function OrderAsBanner() {
  const { orderAsMode, orderAsCustomerName, clearOrderAsSession } = useAuth();

  if (!orderAsMode) return null;

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>Ordering on behalf of {orderAsCustomerName}</span>
      <button
        onClick={clearOrderAsSession}
        className="ml-4 rounded border border-white/50 px-3 py-1 text-xs hover:bg-amber-600"
      >
        End Session
      </button>
    </div>
  );
}
