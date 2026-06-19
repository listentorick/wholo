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
        backgroundColor: '#FFFFFF',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
          <div
            style={{
              width: '7px',
              height: '7px',
              backgroundColor: '#D97036',
              transform: 'rotate(45deg)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '34px',
              fontWeight: '700',
              letterSpacing: '-0.03em',
              color: '#1A1A1A',
              lineHeight: 1,
            }}
          >
            Wholo
          </span>
        </div>
      </div>
    </div>
  );
}
