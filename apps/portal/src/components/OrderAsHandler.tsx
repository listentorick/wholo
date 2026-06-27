'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { orderAsApi } from '@wholo/api-client';
import { useAuth } from '@/lib/auth-context';

// Keycloak JS (v21+) uses sessionStorage for token state, so tokens are not shared
// between tabs. When a new tab opens with ?orderAs=, Keycloak may redirect through
// SSO before setting accessToken — which strips the query param via router.replace.
// Saving the delivery token to sessionStorage before that redirect preserves it.
const PENDING_KEY = 'orderAs_pending';

export function OrderAsHandler() {
  const searchParams = useSearchParams();
  const { accessToken, setOrderAsSession } = useAuth();
  const exchanged = useRef(false);

  const urlToken = searchParams.get('orderAs');

  // Persist the delivery token to sessionStorage as soon as it appears in the URL,
  // before any auth redirect can strip it.
  useEffect(() => {
    if (urlToken) {
      sessionStorage.setItem(PENDING_KEY, urlToken);
    }
  }, [urlToken]);

  useEffect(() => {
    if (exchanged.current || !accessToken) return;

    // Use URL token if present, fall back to sessionStorage (survives SSO redirect)
    const token = urlToken ?? sessionStorage.getItem(PENDING_KEY);
    if (!token) return;

    exchanged.current = true;
    sessionStorage.removeItem(PENDING_KEY);

    const url = new URL(window.location.href);
    url.searchParams.delete('orderAs');
    history.replaceState(null, '', url.pathname + (url.search || ''));

    console.log('[OrderAs] starting exchange');
    orderAsApi.exchange(token, accessToken)
      .then((data) => {
        console.log('[OrderAs] exchange succeeded, customer:', data.customerName);
        setOrderAsSession({
          sessionToken: data.sessionToken,
          customerName: data.customerName,
          distributorId: data.distributorId,
          returnUrl: document.referrer || window.location.origin + window.location.pathname,
        });
      })
      .catch((err: unknown) => {
        console.error('[OrderAs] exchange failed:', err);
        sessionStorage.removeItem(PENDING_KEY);
      });
  }, [urlToken, accessToken, setOrderAsSession]);

  return null;
}
