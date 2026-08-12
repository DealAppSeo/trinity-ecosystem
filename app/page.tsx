// app/page.tsx
//
// Inline styles, not Tailwind utility classes. Tailwind v4 is in dependencies
// and wired through postcss.config.mjs, but app/globals.css never does
// `@import "tailwindcss"`, so no utilities are generated and every utility
// class renders as nothing. That is exactly what this page used to be: eleven
// lines of boilerplate whose classes produced no styling at all.
//
// The dashboard is inline-styled for the same reason. Adding the Tailwind
// import would pull in a preflight reset across every existing surface, which
// is a visual decision rather than a fix — see docs/E2E-AUDIT.md.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TrustRails — KYA for autonomous agents',
  description:
    'Every agent earns a RepID score through audited financial behaviour. ' +
    'Spending limits expand as trust is earned, and every payment leaves a compliance receipt.',
};

const BG = '#020817';
const PANEL = '#0f172a';
const BORDER = '#1e293b';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';
const ACCENT = '#22c55e';

function Panel({
  title,
  body,
  tag,
  tagColor,
}: {
  title: string;
  body: string;
  tag: string;
  tagColor: string;
}) {
  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ color: TEXT, fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
        <span
          style={{
            marginLeft: 'auto',
            color: tagColor,
            border: `1px solid ${tagColor}55`,
            background: `${tagColor}14`,
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
          }}
        >
          {tag}
        </span>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main
      style={{
        background: BG,
        minHeight: '100vh',
        padding: '48px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 44 }}>
          <span style={{ fontSize: 30 }}>🔐</span>
          <div>
            <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 800, margin: 0 }}>TrustRails</h1>
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
              The SSL trust layer for autonomous agent finance
            </p>
          </div>
          <a
            href="/dashboard"
            style={{
              marginLeft: 'auto',
              background: '#14532d',
              color: '#86efac',
              border: '1px solid #166534',
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open dashboard →
          </a>
        </header>

        {/* Thesis */}
        <section style={{ marginBottom: 44 }}>
          <h2
            style={{
              color: TEXT,
              fontSize: 34,
              lineHeight: 1.22,
              fontWeight: 800,
              margin: '0 0 16px',
              maxWidth: 760,
            }}
          >
            Banks have KYC for people. The agentic economy needs KYA.
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.65, maxWidth: 720, margin: 0 }}>
            AI agents are already moving money. Nobody has answered who is accountable when one
            makes a mistake. TrustRails gives every agent a RepID score earned through audited
            behaviour — spending limits expand as trust is earned, and every payment leaves a
            compliance receipt you can check.
          </p>
        </section>

        {/* Honest capability state */}
        <section style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: 0 }}>
              What is actually running
            </h3>
            <span style={{ color: MUTED, fontSize: 12.5 }}>
              Live, simulated and not-yet-wired are labelled separately — on purpose.
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 16,
            }}
          >
            <Panel
              title="KYA registry"
              tag="LIVE"
              tagColor={ACCENT}
              body="Agents registered and scored against institutional policy. Backed by real records, and it is what actually blocks a non-compliant payment today."
            />
            <Panel
              title="RepID scoring"
              tag="LIVE"
              tagColor={ACCENT}
              body="A 0–10,000 institutional credit score that decides vault access and transaction limits, recalculated from observed behaviour."
            />
            <Panel
              title="Compliance receipts"
              tag="LIVE"
              tagColor={ACCENT}
              body="Every authorised payment writes a tamper-evident receipt with a rule hash and an audit hash over the whole record."
            />
            <Panel
              title="Solana settlement"
              tag="DEVNET"
              tagColor="#38bdf8"
              body="USDC transfers on devnet carrying an on-chain compliance memo. When a transfer cannot be broadcast the receipt records SIMULATED — it never invents a transaction hash."
            />
            <Panel
              title="BFT consensus veto"
              tag="NOT WIRED"
              tagColor="#f59e0b"
              body="The engine is built — three independent providers, golden-ratio vote weights, Pythagorean Comma veto — but it does not yet gate the payment path. Receipts record BFT as NOT CHECKED rather than claiming a vote that never ran."
            />
            <Panel
              title="ZKP attestation · Fireblocks"
              tag="STUB"
              tagColor="#a78bfa"
              body="Both are labelled architecture stubs. They demonstrate the integration shape and make no claim to be performing real proofs or custody calls."
            />
          </div>
        </section>

        {/* Why the labels */}
        <section
          style={{
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderLeft: '3px solid #f59e0b',
            borderRadius: 12,
            padding: '18px 22px',
            marginBottom: 40,
          }}
        >
          <p style={{ color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
            <strong style={{ color: TEXT }}>Why a status label on every row.</strong> A compliance
            system that only ever reports success is not a compliance system. A check that did not
            run is <em>not checked</em> — never <em>passed</em>. The same rule governs the receipts:
            they distinguish confirmed from submitted from simulated instead of collapsing all three
            into a green tick.
          </p>
        </section>

        {/* Demos */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>
            Try the guardrails
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a
              href="/api/trustrails/demo/villain"
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#7f1d1d',
                color: '#fca5a5',
                border: '1px solid #991b1b',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              ⛔ Guardrail demo — three non-compliant agents, all blocked
            </a>
            <a
              href="/api/trustrails/demo"
              target="_blank"
              rel="noreferrer"
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
              ✅ Full compliance demo — block, execute, grant vault access
            </a>
          </div>
          <p style={{ color: MUTED, fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
            Both return JSON. The guardrail demo blocks on real KYA and RepID checks, not on a
            scripted response.
          </p>
        </section>

        <footer
          style={{
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 20,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <a href="/dashboard" style={{ color: '#86efac', fontSize: 13, textDecoration: 'none' }}>
            Dashboard
          </a>
          <span style={{ color: MUTED, fontSize: 12.5 }}>
            Solana devnet · ERC-8004 registries on Base Sepolia
          </span>
        </footer>
      </div>
    </main>
  );
}
