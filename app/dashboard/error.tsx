'use client';

// Without this, a throw anywhere in the tree renders the default Next.js error
// screen — no branding, no recovery, and in production no indication of what
// broke. There was no error boundary anywhere in the app.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TrustRails] unhandled error:', error);
  }, [error]);

  return (
    <div style={{
      background: '#020817', minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderLeft: '3px solid #ef4444',
        borderRadius: 14, padding: 28, maxWidth: 560,
      }}>
        <h1 style={{ color: '#f1f5f9', fontSize: 19, fontWeight: 700, margin: '0 0 10px' }}>
          Something failed to load
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 8px' }}>
          This surface could not render. Nothing was written and no payment was authorised — a
          failed read never advances state.
        </p>
        {/* Say which error, rather than a generic apology. The digest is what
            correlates this screen with a server log line. */}
        <p style={{ color: '#64748b', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', margin: '0 0 18px', wordBreak: 'break-word' }}>
          {error.message || 'No message provided.'}
          {error.digest ? ` · digest ${error.digest}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={reset} style={{
            background: '#14532d', color: '#86efac', border: '1px solid #166534',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer',
          }}>Try again</button>
        {/* A HARD navigation is deliberate here. This is a recovery surface: the
            client state that produced the error (or the 404) is exactly what we
            want discarded, and <Link> would preserve it by navigating in-place.
            The rule is correct in general and wrong for this file. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{
            background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, textDecoration: 'none',
          }}>Home</a>
        </div>
      </div>
    </div>
  );
}
