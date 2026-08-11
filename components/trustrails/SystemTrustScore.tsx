// components/trustrails/SystemTrustScore.tsx
// TrustRails Sprint — Created March 26 2026 by Gemini
// THE SSL PADLOCK — most important visual on the dashboard

'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export function SystemTrustScore() {
  const [data, setData] = useState<any>(null);

  const load = async () => {
    const res = await fetch('/api/trustrails/system-trust');
    setData(await res.json());
  };

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    load();
    // Real-time: refresh when any agent RepID changes
    const sub = supabase
      .channel('public:agent_kya_registry')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_kya_registry' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  if (!data) return <div style={{ color: '#666' }}>Loading trust score...</div>;

  const scoreColor =
    data.systemTrustScore >= 8000 ? '#22c55e' :
    data.systemTrustScore >= 6000 ? '#3b82f6' :
    data.systemTrustScore >= 4000 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: '#0f172a',   // dark institutional
      border: `2px solid ${scoreColor}`,
      borderRadius: 16,
      padding: 32,
      marginBottom: 24,
      textAlign: 'center',
    }}>
      {/* SSL Padlock equivalent */}
      <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>

      {/* The one number that matters */}
      <div style={{
        fontSize: 72,
        fontWeight: 900,
        color: scoreColor,
        letterSpacing: -2,
        lineHeight: 1,
      }}>
        {data.systemTrustScore.toLocaleString()}
      </div>
      <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 4 }}>
        System Trust Score / 10,000
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-block',
        background: scoreColor + '22',
        border: `1px solid ${scoreColor}`,
        borderRadius: 8,
        padding: '6px 20px',
        marginTop: 16,
        fontSize: 14,
        fontWeight: 700,
        color: scoreColor,
        letterSpacing: 2,
      }}>
        {data.status}
      </div>

      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>
        {data.tagline}
      </p>

      {/* Key metrics row */}
      <div style={{ display: 'flex', gap: 24, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { label: 'Agents',            value: data.agentCount },
          { label: 'Human Custody',     value: `${data.humanCustodyVerified}/${data.agentCount}` },
          { label: 'Insurance Pool',    value: `$${(data.totalInsuranceCoverage/1000).toFixed(0)}K` },
          { label: '24h Volume',        value: `$${(data.last24Hours?.volumeUSDC/1000 || 0).toFixed(1)}K` },
          { label: 'Compliance Rate',   value: data.last24Hours?.complianceRate || '100%' },
          { label: 'Attempts Blocked',  value: data.last24Hours?.attemptsBocked || 0 },
        ].map(m => (
          <div key={m.label} style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Regulatory readiness */}
      {data.regulatoryStatus && (
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {Object.entries(data.regulatoryStatus).map(([key, val]) => (
            <span key={key} style={{
              background: val ? '#14532d' : '#450a0a',
              color: val ? '#86efac' : '#fca5a5',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {val ? '✓' : '✗'} {key.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          ))}
        </div>
      )}

      {data.regulatoryStatus?.aminaPilotReady && (
        <div style={{
          marginTop: 16,
          background: '#1e3a5f',
          border: '1px solid #3b82f6',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 12,
          color: '#93c5fd',
        }}>
          🏦 AMINA Bank Pilot Ready — System trust score exceeds institutional threshold
        </div>
      )}
    </div>
  );
}
