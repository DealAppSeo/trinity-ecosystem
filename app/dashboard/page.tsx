// app/dashboard/page.tsx
// TrustRails Sprint — Created March 26 2026 by Gemini
// Enterprise institutional dashboard — dark mode, compliance-first

import { SystemTrustScore } from '@/components/trustrails/SystemTrustScore';
import { AgentRepIDGrid }   from '@/components/trustrails/AgentRepIDGrid';
import { LiveReceiptFeed }  from '@/components/trustrails/LiveReceiptFeed';
import { RiskSlider }       from '@/components/trustrails/RiskSlider';
import { InstitutionalControls } from '@/components/trustrails/InstitutionalControls';

export default function Dashboard() {
  return (
    <div style={{
      background: '#020817',   // deep institutional dark
      minHeight: '100vh',
      padding: '24px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 16 }}>
        <span style={{ fontSize: 28 }}>🔐</span>
        <div>
          <h1 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, margin: 0 }}>
            TrustRails
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            The SSL Trust Layer for Autonomous Agent Finance
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href="/api/trustrails/demo/villain" target="_blank"
            style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: 8, padding: '8px 16px', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>
            ⛔ Run Guardrail Demo
          </a>
          <a href="/api/trustrails/demo" target="_blank"
            style={{ background: '#14532d', color: '#86efac', border: '1px solid #166534', borderRadius: 8, padding: '8px 16px', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>
            ✅ Run Compliance Demo
          </a>
        </div>
      </div>

      {/* System Trust Score — THE SSL PADLOCK */}
      <SystemTrustScore />


      {/* Complete Enterprise Control Matrix */}
      <div style={{ marginBottom: 32 }}>
        <InstitutionalControls institutionId="default" />
      </div>

      {/* RepID Institutional Parameter Configuration (Addendum 2) */}
      <div style={{ marginBottom: 24, padding: 24, background: '#0f172a', borderRadius: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, marginBottom: 12 }}>Institutional Risk Configuration</h3>
        <RiskSlider />
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div>
          <AgentRepIDGrid />
        </div>
        <div>
          <LiveReceiptFeed />
        </div>
      </div>

      {/* Compliance footer */}
      <div style={{
        marginTop: 32,
        padding: '16px 24px',
        background: '#0f172a',
        borderRadius: 12,
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {['MiCA Compliant', 'GENIUS Act Ready', 'FATF Rec. 16 Aligned', 'Fireblocks Pre-Auth', 'AMINA Bank Pilot Ready'].map(label => (
          <span key={label} style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>
            ✓ {label}
          </span>
        ))}
      </div>
    </div>
  );
}
