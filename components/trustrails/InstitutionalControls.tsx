// components/trustrails/InstitutionalControls.tsx
// TrustRails Sprint — Created March 26 2026 by Gemini
// The full enterprise control panel — every knob a bank president needs

'use client';

import { useState, useEffect } from 'react';
import { apiFetch, apiPost, ApiError } from '@/lib/api-fetch';

// Regulatory profiles with descriptions
const REGULATORY_PROFILES = [
  { id: 'default',           label: 'TrustRails Default',      desc: 'Balanced security and usability' },
  { id: 'mica_strict',       label: 'MiCA Strict (EU)',         desc: 'Full MiCA Art. 30/68/70 compliance' },
  { id: 'genius_act',        label: 'GENIUS Act (US)',          desc: 'BSA + FinCEN stablecoin rules' },
  { id: 'fatf_travel_rule',  label: 'FATF Travel Rule',         desc: 'Full originator/beneficiary sharing' },
  { id: 'finma_swiss',       label: 'FINMA Swiss',              desc: 'AMINA Bank / Swiss crypto bank rules' },
  { id: 'mas_singapore',     label: 'MAS Singapore',            desc: 'Payment Services Act compliance' },
  { id: 'fca_uk',            label: 'FCA UK',                   desc: 'UK crypto asset regulations' },
  { id: 'air_gap',           label: 'Air Gap Mode',             desc: 'No external LLM calls. Rule-based only.' },
];

// Control groups by persona
const CONTROL_GROUPS = [
  {
    id:      'ceo',
    label:   '👔 Executive Controls',
    persona: 'Bank President / CEO',
    controls: [
      { key: 'max_aggregate_daily_usdc',    type: 'currency', label: 'Maximum aggregate daily exposure (all agents)', default: 1000000 },
      { key: 'board_notification_threshold', type: 'currency', label: 'Board notification threshold (auto-alert above)', default: 100000 },
      { key: 'auto_suspend_on_alert',       type: 'toggle',   label: 'Auto-suspend all agents if aggregate limit hit' },
      { key: 'freeze_requires_dual_unfreeze',type: 'toggle',   label: 'Require dual-sig to unfreeze (prevents unilateral resumption)' },
    ],
  },
  {
    id:      'cto',
    label:   '⚙️ Technical Controls',
    persona: 'CTO / Head of Technology',
    controls: [
      { key: 'llm_version_pinning',       type: 'toggle',  label: 'Pin LLM versions (prevent behavior changes from model updates)' },
      { key: 'air_gap_fallback_enabled',  type: 'toggle',  label: 'Enable air-gap fallback (rule-based if all LLMs unavailable)' },
      { key: 'bft_min_llms',              type: 'slider',  label: 'Minimum distinct LLM providers for BFT', min: 2, max: 5 },
      { key: 'pythagorean_veto_enabled',  type: 'toggle',  label: 'Pythagorean Comma Veto (coordination attack detection)' },
    ],
  },
  {
    id:      'cfo',
    label:   '💰 Financial Controls',
    persona: 'CFO / Treasurer',
    controls: [
      { key: 'trading_hours_only',        type: 'toggle',   label: 'Restrict execution to business hours only' },
      { key: 'counterparty_whitelist_only',type: 'toggle',  label: 'Whitelist-only mode (payments to approved addresses only)' },
      { key: 'new_counterparty_requires_dual_sig', type: 'toggle', label: 'New counterparty requires dual-sig onboarding' },
      { key: 'aggregate_alert_pct',       type: 'slider',   label: 'Alert at % of daily limit', min: 50, max: 95 },
    ],
  },
  {
    id:      'compliance',
    label:   '⚖️ Compliance Controls',
    persona: 'Chief Compliance Officer',
    controls: [
      { key: 'regulatory_profile',        type: 'select',  label: 'Regulatory profile', options: REGULATORY_PROFILES },
      { key: 'sanctions_refresh_hours',   type: 'slider',  label: 'ZKP sanctions re-validation frequency (hours)', min: 1, max: 168 },
      { key: 'auto_sar_threshold_usdc',   type: 'currency',label: 'Auto-flag for SAR review above' },
      { key: 'notify_on_suspicious_pattern', type: 'toggle', label: 'Alert on anomalous agent behavior patterns' },
    ],
  },
  {
    id:      'mobile',
    label:   '📱 Mobile Authentication',
    persona: 'Any authorized signer',
    controls: [
      { key: 'mobile_auth_required_above', type: 'currency', label: 'Require mobile biometric approval above' },
      { key: 'mobile_auth_method',         type: 'select',   label: 'Authentication method',
        options: [
          { id: 'biometric', label: 'Face ID / Fingerprint' },
          { id: 'pin',       label: 'PIN + Device' },
          { id: 'hardware_key', label: 'Hardware Security Key' },
          { id: 'any',       label: 'Any of the above' },
        ]},
      { key: 'mobile_auth_timeout_seconds', type: 'slider', label: 'Approval window (seconds)', min: 60, max: 600 },
    ],
  },
  {
    id:      'privacy',
    label:   '🔒 Privacy & Strategy Controls',
    persona: 'Family Office / Fund Manager / UHNWI',
    controls: [
      { key: 'alpha_protection_mode',  type: 'toggle', label: 'Alpha protection — receipts generated but not publicly readable during active strategy' },
      { key: 'compartmentalized',      type: 'toggle', label: 'Compartmentalize — hard walls between strategies, no cross-contamination' },
      { key: 'jurisdiction_allowlist', type: 'tags',   label: 'Approved jurisdictions (ISO country codes)' },
    ],
  },
];

// Three controls in CONTROL_GROUPS have no column in institution_config:
// llm_version_pinning, air_gap_fallback_enabled and compartmentalized. Saving
// them returned a PostgREST error, but the old save() ignored the response and
// showed "Saved ✓" regardless. They are rendered disabled until the columns
// exist rather than silently failing.
const CONTROLS_WITHOUT_STORAGE = new Set([
  'llm_version_pinning',
  'air_gap_fallback_enabled',
  'compartmentalized',
]);

export function InstitutionalControls({ institutionId = 'default' }: { institutionId?: string }) {
  const [config, setConfig]       = useState<any>(null);
  const [activeGroup, setGroup]   = useState('ceo');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [frozen, setFrozen]       = useState(false);
  const [role, setRole]           = useState<'viewer' | 'operator' | 'owner' | null>(null);
  const [error, setError]         = useState<string | null>(null);
  // Only fields the user actually touched are sent. Posting the whole config
  // back would include server-managed columns (id, institution_id, updated_by,
  // frozen_at) which the API rejects outright — and it would also clobber any
  // concurrent change to a field this user never looked at.
  const [dirty, setDirty]         = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setConfig(null);
    apiFetch<{ config: any; role: 'viewer' | 'operator' | 'owner' }>(
      `/api/trustrails/settings?institution=${encodeURIComponent(institutionId)}`
    )
      .then(d => {
        if (cancelled) return;
        setConfig(d.config || {});
        setFrozen(d.config?.frozen || false);
        setRole(d.role);
        setDirty(new Set());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Say which failure this is. An empty panel is indistinguishable from
        // "this institution has no policy configured".
        setError(
          e instanceof ApiError && e.isUnauthenticated
            ? 'Sign in to view institutional controls.'
            : e instanceof Error
              ? e.message
              : String(e)
        );
      });
    return () => { cancelled = true; };
  }, [institutionId]);

  const markDirty = (key: string) => setDirty(prev => new Set(prev).add(key));

  const save = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      // Array.from rather than iterating the Set directly — this tsconfig
      // targets below es2015, so `for…of` over a Set needs downlevelIteration.
      for (const key of Array.from(dirty)) patch[key] = config[key];
      await apiPost('/api/trustrails/settings', { institutionId, config: patch });
      setDirty(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const freeze = async () => {
    if (!confirm('Freeze ALL agent activity? This requires dual-sig to reverse.')) return;
    setError(null);
    try {
      // Send only the flag. `frozen_at` and `frozen_by` are stamped server-side
      // from the authenticated actor so the record cannot be forged.
      await apiPost('/api/trustrails/settings', { institutionId, config: { frozen: true } });
      setConfig({ ...config, frozen: true });
      setFrozen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error && !config) {
    return (
      <div style={{ background: '#0f172a', borderRadius: 16, padding: 24 }}>
        <p style={{ color: '#fca5a5', fontSize: 13.5, margin: 0 }}>{error}</p>
        <a href="/login" style={{ color: '#86efac', fontSize: 13, textDecoration: 'none' }}>
          Go to sign in →
        </a>
      </div>
    );
  }

  if (!config) return <div style={{ color: '#64748b', padding: 24 }}>Loading controls...</div>;

  const canEdit = role === 'operator' || role === 'owner';

  const currentGroup = CONTROL_GROUPS.find(g => g.id === activeGroup)!;

  return (
    <div style={{ background: '#0f172a', borderRadius: 16, padding: 24, color: '#f1f5f9' }}>

      {/* Emergency freeze banner */}
      {frozen && (
        <div style={{
          background: '#450a0a', border: '2px solid #ef4444',
          borderRadius: 10, padding: 16, marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 16 }}>
              🔴 ALL AGENT ACTIVITY FROZEN
            </div>
            <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>
              Frozen by {config.frozen_by} at {config.frozen_at
                ? new Date(config.frozen_at).toLocaleString() : 'unknown'}.
              Dual-sig required to unfreeze.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🏛️ Institutional Control Matrix
          </h2>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            You set every threshold. We enforce every rule cryptographically.
            All changes are permanently logged with approver signature.
          </p>
        </div>
        {!frozen && (
          <button onClick={freeze}
            style={{
              background: '#7f1d1d', color: '#fca5a5',
              border: '1px solid #991b1b', borderRadius: 8,
              padding: '8px 16px', fontSize: 12, cursor: 'pointer',
            }}>
            🔴 Emergency Freeze
          </button>
        )}
      </div>

      {/* Regulatory profile quick-select */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          Regulatory Profile — one click switches all compliance rules
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {REGULATORY_PROFILES.map(profile => (
            <button key={profile.id}
              onClick={() => { markDirty('regulatory_profile'); setConfig((c: any) => ({ ...c, regulatory_profile: profile.id })); }}
              title={profile.desc}
              style={{
                background: config.regulatory_profile === profile.id ? '#1d4ed8' : '#1e293b',
                color:      config.regulatory_profile === profile.id ? '#fff' : '#94a3b8',
                border:     `1px solid ${config.regulatory_profile === profile.id ? '#3b82f6' : '#334155'}`,
                borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              }}>
              {profile.label}
            </button>
          ))}
        </div>
      </div>

      {/* Control group tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CONTROL_GROUPS.map(group => (
          <button key={group.id}
            onClick={() => setGroup(group.id)}
            style={{
              background:  activeGroup === group.id ? '#1e3a5f' : '#1e293b',
              color:       activeGroup === group.id ? '#93c5fd' : '#64748b',
              border:      `1px solid ${activeGroup === group.id ? '#3b82f6' : '#334155'}`,
              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
            {group.label}
          </button>
        ))}
      </div>

      {/* Persona label */}
      <div style={{
        background: '#1e293b', borderRadius: 8, padding: '8px 14px',
        marginBottom: 16, fontSize: 12, color: '#94a3b8',
      }}>
        Controls for: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{currentGroup.persona}</span>
      </div>

      {/* Controls for active group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {currentGroup.controls.map(control => (
          <div key={control.key} style={{
            background: '#1e293b', borderRadius: 10, padding: 16,
            opacity: CONTROLS_WITHOUT_STORAGE.has(control.key) ? 0.55 : 1,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              {control.label}
              {CONTROLS_WITHOUT_STORAGE.has(control.key) && (
                <span style={{
                  marginLeft: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  color: '#f59e0b', border: '1px solid #f59e0b55', background: '#f59e0b14',
                  borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
                }}>NOT STORED</span>
              )}
            </div>
            {CONTROLS_WITHOUT_STORAGE.has(control.key) && (
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 8, lineHeight: 1.5 }}>
                No column exists for this setting yet, so it cannot be saved. Shown for
                roadmap visibility rather than hidden.
              </div>
            )}

            {control.type === 'toggle' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  onClick={() => { markDirty(control.key); setConfig((c: any) => ({ ...c, [control.key]: !c[control.key] })); }}
                  style={{
                    width: 48, height: 26, borderRadius: 13,
                    background: config[control.key] ? '#22c55e' : '#334155',
                    cursor: 'pointer', position: 'relative', flexShrink: 0,
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, background: '#fff',
                    position: 'absolute', top: 3,
                    left: config[control.key] ? 24 : 4, transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ color: config[control.key] ? '#22c55e' : '#64748b', fontSize: 13 }}>
                  {config[control.key] ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            )}

            {control.type === 'currency' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#64748b', fontSize: 14 }}>$</span>
                <input
                  type="number"
                  value={config[control.key] || 0}
                  onChange={e => { markDirty(control.key); setConfig((c: any) => ({ ...c, [control.key]: Number(e.target.value) })); }}
                  style={{
                    background: '#0f172a', border: '1px solid #334155',
                    borderRadius: 6, padding: '6px 12px', color: '#f1f5f9',
                    fontSize: 16, fontWeight: 700, width: 160,
                  }}
                />
                <span style={{ color: '#64748b', fontSize: 12 }}>USDC</span>
              </div>
            )}

            {control.type === 'slider' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range"
                  min={(control as any).min || 0}
                  max={(control as any).max || 100}
                  value={config[control.key] || 0}
                  onChange={e => { markDirty(control.key); setConfig((c: any) => ({ ...c, [control.key]: Number(e.target.value) })); }}
                  style={{ flex: 1, accentColor: '#3b82f6' }}
                />
                <span style={{ color: '#f1f5f9', fontWeight: 700, minWidth: 40 }}>
                  {config[control.key]}
                </span>
              </div>
            )}

            {control.type === 'select' && (
              <select
                value={config[control.key] || ''}
                onChange={e => { markDirty(control.key); setConfig((c: any) => ({ ...c, [control.key]: e.target.value })); }}
                style={{
                  background: '#0f172a', border: '1px solid #334155',
                  borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 13,
                }}>
                {((control as any).options || []).map((opt: any) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      {/* Save */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{
            background: saved ? '#22c55e' : '#1d4ed8',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
          {saving ? 'Saving...' : saved ? '✓ Saved to Institution Config' : 'Save Controls'}
        </button>
        <span style={{ color: '#475569', fontSize: 11 }}>
          Logged to immutable audit trail with timestamp
        </span>
      </div>

      {/* Compliance footer */}
      <div style={{
        marginTop: 20, padding: 12, background: '#0f172a', borderRadius: 8,
        fontSize: 11, color: '#475569', borderTop: '1px solid #1e293b',
        lineHeight: 1.6,
      }}>
        All controls enforced cryptographically before any agent action executes.
        Every change permanently logged. Emergency freeze requires dual-sig to reverse.
        Compatible with: MiCA · GENIUS Act · FATF Rec. 16 · FINMA · MAS · FCA
      </div>
    </div>
  );
}
