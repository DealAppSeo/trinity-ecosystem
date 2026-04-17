// components/trustrails/RiskSlider.tsx
// TrustShell Sprint — Created March 26 2026 by Gemini
// THE "AHA" MOMENT for AMINA judges — set your own risk tolerance

'use client';

import { useState } from 'react';

const PRESETS = {
  'AMINA Conservative (MiCA)': { bftAccuracy: 0.20, veritasCatchRate: 0.20, x402SuccessRate: 0.10, latencyOpportunity: 0.05, humanCustodyScore: 0.45 },
  'Balanced Portfolio':         { bftAccuracy: 0.35, veritasCatchRate: 0.25, x402SuccessRate: 0.25, latencyOpportunity: 0.10, humanCustodyScore: 0.05 },
  'Default TrustRails':         { bftAccuracy: 0.40, veritasCatchRate: 0.30, x402SuccessRate: 0.15, latencyOpportunity: 0.10, humanCustodyScore: 0.05 },
};

export function RiskSlider({ onRepIDChange }: { onRepIDChange?: (score: number) => void }) {
  // @ts-ignore
  const [weights, setWeights] = useState(PRESETS['Default TrustRails']);
  const [sophiaRepID, setSophiaRepID] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    setLoading(true);
    const res = await fetch('/api/trustrails/repid/configure', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ institutionId: 'demo-judge', weights }),
    });
    const data = await res.json();
    const newScore = data.sophiaRepIDWithNewWeights?.repidScore;
    setSophiaRepID(newScore);
    onRepIDChange?.(newScore);
    setLoading(false);
  };

  const scoreColor = !sophiaRepID ? '#64748b' :
    sophiaRepID >= 7500 ? '#22c55e' :
    sophiaRepID >= 5000 ? '#3b82f6' :
    sophiaRepID >= 2500 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        🎚️ Set Your Institution's Risk Tolerance
      </h3>
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>
        Like adjusting a portfolio risk model or cap-rate threshold. Weights determine how RepID is calculated for your institution.
      </p>

      {/* Presets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(PRESETS).map(([label, preset]) => (
          <button key={label}
            onClick={() => setWeights(preset)}
            style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      {Object.entries(weights).map(([key, val]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600 }}>
              {(val * 100).toFixed(0)}%
            </span>
          </div>
          <input type="range" min={0} max={100} step={5}
            value={Math.round(val * 100)}
            onChange={e => setWeights(prev => ({ ...prev, [key]: Number(e.target.value) / 100 }))}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>
      ))}

      {/* Weight sum warning */}
      {Math.abs(Object.values(weights).reduce((s, v) => s + v, 0) - 1.0) > 0.01 && (
        <p style={{ color: '#ef4444', fontSize: 11, marginBottom: 12 }}>
          ⚠️ Weights must sum to 100%. Current: {(Object.values(weights).reduce((s, v) => s + v, 0) * 100).toFixed(0)}%
        </p>
      )}

      {/* Apply button */}
      <button onClick={apply} disabled={loading}
        style={{ width: '100%', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
        {loading ? 'Recalculating...' : 'Apply to My Institution →'}
      </button>

      {/* Live result */}
      {sophiaRepID && (
        <div style={{ marginTop: 16, textAlign: 'center', background: '#0f172a', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>SOPHIA RepID with your weights</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor }}>{sophiaRepID.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: scoreColor, marginTop: 4 }}>
            {sophiaRepID >= 7500 ? '✓ Meets vault threshold' :
             sophiaRepID >= 5000 ? '✓ Meets payment threshold' :
             '✗ Below minimum — agent requires review'}
          </div>
        </div>
      )}
    </div>
  );
}
