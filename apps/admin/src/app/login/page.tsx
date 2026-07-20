'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();

  useEffect(() => {
    login();
  }, [login]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'hsl(var(--color-surface))',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/stocdup-logo-only.png" alt="" style={{ width: '40px', height: '40px', flexShrink: 0 }} />
        <span
          style={{
            fontSize: '34px',
            fontWeight: '700',
            letterSpacing: '-0.03em',
            color: 'hsl(var(--color-text))',
            lineHeight: 1,
          }}
        >
          stocd<span style={{ color: 'hsl(var(--color-primary))' }}>up</span>
        </span>
      </div>
    </div>
  );
}
