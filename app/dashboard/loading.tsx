// The dashboard fans out to several data sources on mount. Without a loading
// state the route showed a blank dark screen while they resolved, which is
// indistinguishable from a hang.

export default function DashboardLoading() {
  return (
    <div style={{
      background: '#020817', minHeight: '100vh', padding: 24,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <span style={{ fontSize: 28 }}>🔐</span>
        <div>
          <h1 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, margin: 0 }}>TrustRails</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading institutional dashboard…</p>
        </div>
      </div>
      {[96, 220, 150].map((h, i) => (
        <div key={i} style={{
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14,
          height: h, marginBottom: 20,
        }} />
      ))}
    </div>
  );
}
