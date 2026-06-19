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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
        <div
          style={{
            width: '7px',
            height: '7px',
            backgroundColor: 'hsl(var(--color-primary))',
            transform: 'rotate(45deg)',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '34px',
            fontWeight: '700',
            letterSpacing: '-0.03em',
            color: 'hsl(var(--color-text))',
            lineHeight: 1,
          }}
        >
          Wholo
        </span>
      </div>
    </div>
  );
}
