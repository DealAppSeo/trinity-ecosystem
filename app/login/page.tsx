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
import {
  applySessionProbe,
  applySignInResult,
  applySignOutResult,
  SIGNED_OUT,
  type SessionView,
} from '@/lib/auth-session';

const BG = '#020817';
const PANEL = '#0f172a';
const BORDER = '#1e293b';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // One view, not three loose pieces of state. The transitions live in
  // `lib/auth-session.ts` so they can be gated — see that file's header for why
  // a client component was the wrong place for them.
  const [view, setView] = useState<SessionView>(SIGNED_OUT);
  const { status, error, email: currentEmail } = view;

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then((result) => setView(applySessionProbe(result)))
      // A missing/misconfigured Supabase key THROWS rather than returning an
      // error. Routed through the same transition so a broken deployment does
      // not render as a merely logged-out one.
      .catch((e: unknown) =>
        setView(applySessionProbe({ error: { message: e instanceof Error ? e.message : String(e) } }))
      );
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setView({ status: 'working', email: null, error: null });
    try {
      const result = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
      setView(applySignInResult(result, email));
    } catch (e) {
      setView(applySignInResult({ error: { message: e instanceof Error ? e.message : String(e) } }, email));
    }
  }

  async function signOut() {
    // On failure this KEEPS the signed-in view, because that is still true. See
    // `applySignOutResult` — the tidy answer and the honest one differ here.
    try {
      setView(applySignOutResult(await getSupabaseBrowser().auth.signOut(), view));
    } catch (e) {
      setView(
        applySignOutResult({ error: { message: e instanceof Error ? e.message : String(e) } }, view)
      );
    }
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
            {/* A failed sign-out leaves status 'signed-in', so the error has to
                render HERE too. The form branch below is unreachable in that
                state — which is how this message would have been set and never
                shown, replacing a false "signed out" with a silent one. */}
            {error && (
              <p
                style={{
                  color: '#fca5a5',
                  fontSize: 12.5,
                  margin: '-8px 0 18px',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}
              >
                {error}
              </p>
            )}
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
