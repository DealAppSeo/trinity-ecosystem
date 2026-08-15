// The app has exactly two pages, so a mistyped path was hitting the bare
// Next.js 404 with no way back.

export default function NotFound() {
  return (
    <div style={{
      background: '#020817', minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <p style={{ color: '#334155', fontSize: 52, fontWeight: 800, margin: 0, lineHeight: 1 }}>404</p>
        <h1 style={{ color: '#f1f5f9', fontSize: 19, fontWeight: 700, margin: '14px 0 8px' }}>
          No such page
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 20px' }}>
          TrustRails serves a landing page and the institutional dashboard.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {/* A HARD navigation is deliberate here. This is a recovery surface: the
            client state that produced the error (or the 404) is exactly what we
            want discarded, and <Link> would preserve it by navigating in-place.
            The rule is correct in general and wrong for this file. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{
            background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, textDecoration: 'none',
          }}>Home</a>
          <a href="/dashboard" style={{
            background: '#14532d', color: '#86efac', border: '1px solid #166534',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, textDecoration: 'none',
          }}>Dashboard</a>
        </div>
      </div>
    </div>
  );
}
