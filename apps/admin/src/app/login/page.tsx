'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, ApiError } from '@/lib/auth-context';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setApiError(null);
    try {
      await login(data.email, data.password);
      router.push('/');
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-1 { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-2 { animation: fadeUp 0.45s 0.08s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-3 { animation: fadeUp 0.45s 0.16s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-4 { animation: fadeUp 0.45s 0.24s cubic-bezier(0.22,1,0.36,1) both; }

        .adm-input {
          width: 100%;
          border: none;
          border-bottom: 1.5px solid hsl(var(--color-border));
          background: transparent;
          padding: 10px 0 12px;
          font-size: 15px;
          color: hsl(var(--color-text));
          outline: none;
          transition: border-color 0.2s ease;
          font-family: inherit;
          caret-color: hsl(var(--color-primary));
        }
        .adm-input::placeholder { color: hsl(var(--color-muted)); }
        .adm-input:focus { border-bottom-color: hsl(var(--color-primary)); }
        .adm-input:disabled { opacity: 0.45; cursor: not-allowed; }

        .adm-btn {
          width: 100%;
          border: 1.5px solid hsl(var(--color-primary));
          background: hsl(var(--color-surface));
          color: hsl(var(--color-primary));
          padding: 15px 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.22s ease, color 0.22s ease;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 0;
        }
        .adm-btn:hover:not(:disabled) {
          background: hsl(var(--color-primary));
          color: hsl(var(--color-primary-fg));
        }
        .adm-btn:active:not(:disabled) {
          background: hsl(var(--color-primary-hover));
          border-color: hsl(var(--color-primary-hover));
          color: hsl(var(--color-primary-fg));
        }
        .adm-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .adm-spinner {
          width: 13px; height: 13px;
          border: 1.5px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.65s linear infinite;
          flex-shrink: 0;
        }
      `}</style>

      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          backgroundColor: 'hsl(var(--color-surface))',
        }}
      >
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Wordmark */}
          <div className="anim-1" style={{ marginBottom: '52px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
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
            <p
              style={{
                fontSize: '12px',
                color: 'hsl(var(--color-muted))',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '18px',
              }}
            >
              Admin Portal
            </p>
            <div style={{ width: '28px', height: '1.5px', backgroundColor: 'hsl(var(--color-primary))', margin: '0 auto' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>

            {/* Email */}
            <div className="anim-2" style={{ marginBottom: '28px' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: '600',
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: 'hsl(var(--color-text))',
                  marginBottom: '4px',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled={isSubmitting}
                className="adm-input"
                {...register('email')}
              />
              {errors.email && (
                <p style={{ marginTop: '6px', fontSize: '12px', color: '#EF4444', lineHeight: 1.4 }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="anim-3" style={{ marginBottom: '40px' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: '600',
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: 'hsl(var(--color-text))',
                  marginBottom: '4px',
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={isSubmitting}
                className="adm-input"
                {...register('password')}
              />
              {errors.password && (
                <p style={{ marginTop: '6px', fontSize: '12px', color: '#EF4444', lineHeight: 1.4 }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {apiError && (
              <p
                style={{
                  marginBottom: '18px',
                  fontSize: '13px',
                  color: '#EF4444',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                {apiError}
              </p>
            )}

            <div className="anim-4">
              <button type="submit" className="adm-btn" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <div className="adm-spinner" />
                    Signing in
                  </>
                ) : (
                  'Log in'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
