'use client';

// app/login/page.tsx
//
// The dashboard had no sign-in at all — `institutionId` was the hardcoded
// string "default" and the API routes asked nobody for credentials. Requiring
// auth on the mutating routes without a way to sign in would simply break the
// product, so this ships alongside it.
//
// Inline styles rather than Tailwind utility classes: globals.css never imports
// Tailwind, so utility classes render as nothing (see docs/E2E-AUDIT.md G18).

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const BG = '#020817';
const PANEL = '#0f172a';
const BORDER = '#1e293b';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'signed-in'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session?.user?.email) {
          setCurrentEmail(data.session.user.email);
          setStatus('signed-in');
        }
      })
      // A missing/misconfigured Supabase key throws here. Show it rather than
      // rendering a login form that cannot possibly work.
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('working');
    try {
      const { data, error: signInError } = await getSupabaseBrowser().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      setCurrentEmail(data.user?.email ?? email);
      setStatus('signed-in');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('idle');
    }
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    setCurrentEmail(null);
    setStatus('idle');
  }

  return (
    <main
      style={{
        background: BG,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 32,
          width: '100%',
          maxWidth: 400,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>🔐</span>
          <h1 style={{ color: TEXT, fontSize: 19, fontWeight: 800, margin: 0 }}>TrustRails</h1>
        </div>
        <p style={{ color: MUTED, fontSize: 13, margin: '0 0 24px' }}>
          Sign in to view and change institutional risk policy.
        </p>

        {status === 'signed-in' ? (
          <>
            <p style={{ color: '#86efac', fontSize: 13.5, margin: '0 0 18px' }}>
              Signed in as <strong>{currentEmail}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href="/dashboard"
                style={{
                  background: '#14532d',
                  color: '#86efac',
                  border: '1px solid #166534',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Open dashboard →
              </a>
              <button
                onClick={signOut}
                style={{
                  background: '#1e293b',
                  color: '#cbd5e1',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={signIn}>
            <label style={{ color: '#94a3b8', fontSize: 12.5, display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />

            <label
              style={{ color: '#94a3b8', fontSize: 12.5, display: 'block', margin: '16px 0 6px' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />

            {error && (
              <p
                style={{
                  color: '#fca5a5',
                  fontSize: 12.5,
                  margin: '16px 0 0',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'working'}
              style={{
                width: '100%',
                marginTop: 22,
                background: status === 'working' ? '#1e293b' : '#14532d',
                color: status === 'working' ? MUTED : '#86efac',
                border: `1px solid ${status === 'working' ? BORDER : '#166534'}`,
                borderRadius: 8,
                padding: '11px 16px',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: status === 'working' ? 'default' : 'pointer',
              }}
            >
              {status === 'working' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#020817',
  color: TEXT,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13.5,
  fontFamily: 'inherit',
};
