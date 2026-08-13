// components/trustrails/AgentRepIDGrid.tsx
// TrustRails Sprint — Created March 26 2026 by Gemini

'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch, ApiError } from '@/lib/api-fetch';

const TIER_COLORS: Record<string, string> = {
  Platinum: '#e2e8f0',
  Gold:     '#fbbf24',
  Silver:   '#94a3b8',
  Bronze:   '#b45309',
};

export function AgentRepIDGrid() {
  const [agents, setAgents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    // Reads go through the API route, which holds the service key and returns
    // only the six columns this grid renders. The browser client is kept for
    // the realtime subscription below — it carries the signed-in user's token,
    // so it subscribes as `authenticated` rather than `anon`.
    const load = async () => {
      try {
        const d = await apiFetch<{ agents: any[] }>('/api/trustrails/agents');
        setAgents(d.agents || []);
        setError(null);
      } catch (e) {
        setError(
          e instanceof ApiError && e.isUnauthenticated
            ? 'Sign in to view the agent registry.'
            : e instanceof Error ? e.message : String(e)
        );
      }
    };
    load();

    const sub = supabase
      .channel('public:agent_kya_registry')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_kya_registry' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  if (error) {
    return (
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 20 }}>
        <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 8px' }}>{error}</p>
        <a href="/login" style={{ color: '#86efac', fontSize: 13, textDecoration: 'none' }}>Go to sign in →</a>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ color: '#f1f5f9', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Agent KYA Registry — Live RepID Scores
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {agents.map(agent => {
          const color = TIER_COLORS[agent.repid_tier] || '#64748b';
          const pct   = (agent.repid_score / 10000) * 100;
          return (
            <div key={agent.agent_name} style={{
              background: '#1e293b',
              border: `1px solid ${color}44`,
              borderRadius: 12,
              padding: 16,
            }}>
              {/* Agent name + tier */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
                  {agent.agent_name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color,
                  border: `1px solid ${color}`,
                  borderRadius: 4, padding: '2px 6px',
                }}>
                  {agent.repid_tier?.toUpperCase()}
                </span>
              </div>

              {/* RepID score */}
              <div style={{ fontSize: 28, fontWeight: 900, color, marginTop: 8, lineHeight: 1 }}>
                {Number(agent.repid_score).toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>RepID / 10,000</div>

              {/* Progress bar */}
              <div style={{ background: '#0f172a', borderRadius: 4, height: 6, marginTop: 10 }}>
                <div style={{ width: `${pct}%`, height: 6, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>

              {/* Badges */}
              <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {agent.human_custody_verified && (
                  <span style={{ fontSize: 9, background: '#14532d', color: '#86efac', borderRadius: 4, padding: '2px 6px' }}>
                    🔐 CUSTODY
                  </span>
                )}
                {agent.vault_access_permitted && (
                  <span style={{ fontSize: 9, background: '#1e3a5f', color: '#93c5fd', borderRadius: 4, padding: '2px 6px' }}>
                    🏦 VAULT
                  </span>
                )}
                <span style={{ fontSize: 9, background: '#1a1a2e', color: '#a78bfa', borderRadius: 4, padding: '2px 6px' }}>
                  🛡️ ${(Number(agent.insurance_coverage)/1000).toFixed(0)}K
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
