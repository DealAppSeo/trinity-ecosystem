'use client';

// components/trustrails/OperationsPanel.tsx
//
// Surfaces the operational history the dashboard was ignoring. Two 12-row
// tables were on screen while 171,000+ rows sat unread — including 2,851
// recorded trade refusals, which the README calls the product's killer feature.
//
// Two rules shape this component:
//
//  1. Every block states when its data last changed. Agent logs are live
//     (thousands per day); trades stopped in July and signals ran for ten days
//     in April. Rendering them side by side without dating them would present
//     stale history as current activity — the same false-pass class this
//     codebase keeps producing.
//
//  2. Counts come from the API, which aggregates in Postgres. Nothing here
//     fetches rows and counts them client-side.
//
// Inline styles, not Tailwind: globals.css never imports Tailwind, so utility
// classes render as nothing (docs/E2E-AUDIT.md G18).

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-fetch';

const PANEL = '#0f172a';
const CARD = '#1e293b';
const BORDER = '#1e293b';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';
const DIM = '#94a3b8';

interface Activity {
  generatedAt: string;
  guardrail: {
    total: number; refused: number; executed: number;
    comma_refusals: number; test_fixtures: number; assets: number;
    last_at: string | null;
    topReasons: Array<{ class: string; n: number }>;
    severity: Array<{ k: string; n: number }>;
  };
  agents: {
    total: number; last_24h: number; last_7d: number; agents: number;
    last_at: string | null;
    top: Array<{ agent: string; n: number }>;
  };
  signals: {
    total: number; names: number; sources: number; last_at: string | null;
    top: Array<{ signal_name: string; n: number; avg_normalized: number | null }>;
  };
  crossLlm: { total: number; avg_agreement: number | null; vetoes: number; last_at: string | null };
  vault: { total: number; denied: number; last_at: string | null };
}

const fmt = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('en-US') : '—';

/** Days since a timestamp, or null when there is none. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

/**
 * A dated badge, so "live" and "four months stale" never look alike.
 * Thresholds are deliberately coarse — the point is the distinction, not
 * precision.
 */
function Recency({ iso }: { iso: string | null }) {
  const days = daysSince(iso);
  if (days === null) {
    return <Badge color="#64748b" text="NO DATA" />;
  }
  if (days < 1) return <Badge color="#22c55e" text="LIVE — today" />;
  if (days <= 7) return <Badge color="#22c55e" text={`ACTIVE — ${days}d ago`} />;
  if (days <= 45) return <Badge color="#f59e0b" text={`IDLE — ${days}d ago`} />;
  return <Badge color="#94a3b8" text={`HISTORICAL — ${days}d ago`} />;
}

function Badge({ color, text }: { color: string; text: string }) {
  return (
    <span
      style={{
        color,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function Section({
  title,
  subtitle,
  iso,
  children,
}: {
  title: string;
  subtitle?: string;
  iso: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: CARD, borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h4 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h4>
        <span style={{ marginLeft: 'auto' }}><Recency iso={iso} /></span>
      </div>
      {subtitle && (
        <p style={{ color: MUTED, fontSize: 11.5, margin: '0 0 14px', lineHeight: 1.5 }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, color = TEXT }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ color, fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
      <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/** Horizontal bar row for a top-N breakdown. */
function Bar({ label, n, max, hint }: { label: string; n: number; max: number; hint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ marginLeft: 'auto', color: MUTED, whiteSpace: 'nowrap' }}>
          {hint ? `${hint} · ` : ''}{fmt(n)}
        </span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#334155' }} />
      </div>
    </div>
  );
}

export function OperationsPanel() {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Activity>('/api/trustrails/activity')
      .then(d => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.isUnauthenticated
            ? 'Sign in to see operational history.'
            : e instanceof Error ? e.message : String(e)
        );
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ background: PANEL, borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <h3 style={{ color: TEXT, fontSize: 18, margin: '0 0 8px' }}>Operational history</h3>
        <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 8px' }}>{error}</p>
        <a href="/login" style={{ color: '#86efac', fontSize: 13, textDecoration: 'none' }}>Go to sign in →</a>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: PANEL, borderRadius: 16, padding: 24, marginBottom: 24, color: MUTED }}>
        Loading operational history…
      </div>
    );
  }

  const { guardrail, agents, signals, crossLlm, vault } = data;
  const decided = guardrail.refused + guardrail.executed;
  const refusalRate = decided > 0 ? (guardrail.refused / decided) * 100 : 0;
  const maxReason = Math.max(1, ...guardrail.topReasons.map(r => r.n));
  const maxAgent = Math.max(1, ...agents.top.map(a => a.n));
  const maxSignal = Math.max(1, ...signals.top.map(s => s.n));

  const grandTotal =
    guardrail.total + agents.total + signals.total + crossLlm.total + vault.total;

  return (
    <div style={{ background: PANEL, borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ color: TEXT, fontSize: 18, fontWeight: 700, margin: 0 }}>Operational history</h3>
        <span style={{ color: MUTED, fontSize: 12.5 }}>
          {fmt(grandTotal)} recorded events across five tables
        </span>
      </div>
      <p style={{ color: MUTED, fontSize: 11.5, margin: '0 0 18px' }}>
        Each block is dated. Agent activity is live; trade and signal history predate it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

        {/* The refusals — the product's stated killer feature */}
        <Section
          title="⛔ Guardrail record"
          subtitle="Trades the system declined to make. This is the record the product is built to produce."
          iso={guardrail.last_at}
        >
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <Stat label="refused" value={fmt(guardrail.refused)} color="#fca5a5" />
            <Stat label="executed" value={fmt(guardrail.executed)} color="#86efac" />
            <Stat label="refusal rate" value={`${refusalRate.toFixed(1)}%`} />
          </div>
          <div style={{ color: DIM, fontSize: 11.5, marginBottom: 10, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT }}>{fmt(guardrail.comma_refusals)}</strong> cite the
            Pythagorean Comma threshold — the veto firing on real decisions.
            {guardrail.test_fixtures > 0 && (
              <>
                {' '}
                <span style={{ color: '#f59e0b' }}>
                  {fmt(guardrail.test_fixtures)} rows are integration-test fixtures, not live decisions.
                </span>
              </>
            )}
          </div>
          {guardrail.topReasons.map(r => (
            <Bar key={r.class} label={r.class} n={r.n} max={maxReason} />
          ))}
        </Section>

        {/* Agent activity — the live one */}
        <Section
          title="🤖 Agent activity"
          subtitle={`${fmt(agents.agents)} distinct agents writing to the shared log.`}
          iso={agents.last_at}
        >
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <Stat label="total entries" value={fmt(agents.total)} />
            <Stat label="last 7 days" value={fmt(agents.last_7d)} color="#86efac" />
            <Stat label="last 24h" value={fmt(agents.last_24h)} color="#86efac" />
          </div>
          {agents.top.map(a => (
            <Bar key={a.agent} label={a.agent} n={a.n} max={maxAgent} />
          ))}
        </Section>

        {/* Market signals */}
        <Section
          title="📈 Market signals"
          subtitle={`${fmt(signals.names)} signals from ${fmt(signals.sources)} sources.`}
          iso={signals.last_at}
        >
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <Stat label="readings" value={fmt(signals.total)} />
            <Stat label="distinct signals" value={fmt(signals.names)} />
          </div>
          {signals.top.map(s => (
            <Bar
              key={s.signal_name}
              label={s.signal_name}
              n={s.n}
              max={maxSignal}
              hint={s.avg_normalized !== null ? `avg ${s.avg_normalized}` : undefined}
            />
          ))}
        </Section>

        {/* Cross-LLM + vault, the two small ones */}
        <Section
          title="🔀 Cross-LLM verification & vault access"
          subtitle="Independent-provider comparisons, and permissioned vault decisions."
          iso={crossLlm.last_at}
        >
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <Stat label="comparisons" value={fmt(crossLlm.total)} />
            <Stat
              label="mean agreement"
              value={crossLlm.avg_agreement !== null ? crossLlm.avg_agreement.toFixed(3) : '—'}
            />
            <Stat label="comma vetoes" value={fmt(crossLlm.vetoes)} />
          </div>
          {crossLlm.vetoes === 0 && crossLlm.total > 0 && (
            // Stating this plainly rather than letting a zero read as "all clear".
            <p style={{ color: '#f59e0b', fontSize: 11.5, margin: '0 0 12px', lineHeight: 1.5 }}>
              The Comma veto has never fired on this path across {fmt(crossLlm.total)} comparisons,
              despite firing {fmt(guardrail.comma_refusals)} times on trade decisions. Worth
              confirming the threshold is wired here.
            </p>
          )}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', gap: 24 }}>
            <Stat label="vault accesses" value={fmt(vault.total)} />
            <Stat label="denied" value={fmt(vault.denied)} color={vault.denied > 0 ? '#fca5a5' : TEXT} />
          </div>
        </Section>
      </div>
    </div>
  );
}
