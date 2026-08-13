#!/usr/bin/env node
//
// north-star.mjs — the live half of NORTH-STAR.md.
//
//   npm run north
//
// NORTH-STAR.md holds the spine, the verdicts and the gaps: things that change
// when a decision changes. This holds the counts: things that change hourly.
// Splitting them is the whole point. A single page carrying both becomes wrong
// within a day, stops being trusted, and joins the pile of nine dead planning
// surfaces that made this file necessary.
//
// Every pillar reports one of:
//
//   LIVE          rows written within 7 days
//   COOLING       rows exist, newest is 7-30 days old
//   STALE         newest is over 30 days old
//   EMPTY         table exists, no rows
//   NOT MEASURED  the query did not run. NOT a pass.
//
// Exit 2 if anything is NOT MEASURED, so an unrunnable check cannot read as a
// clean bill of health. From a cloud session that is the expected outcome:
// *.supabase.co is denied by the egress proxy.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY;

if (!URL || !KEY) {
  console.error(
    'NOT MEASURED — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.\n' +
      'Nothing was queried, so nothing below would have been true.'
  );
  process.exit(2);
}

/** The spine, in order. Each link is only as good as the one before it. */
const PILLARS = [
  { link: 'HAL',       label: 'hallucination classifications', table: 'hal_classifications' },
  { link: 'HAL',       label: 'audit chain',                   table: 'hal_audit_chain' },
  { link: 'RepID',     label: 'score events',                  table: 'repid_score_events' },
  { link: 'RepID',     label: 'registered agents',             table: 'repid_agents' },
  { link: 'ZKP',       label: 'proofs generated',              table: 'repid_zkp_proofs' },
  { link: 'x402',      label: 'settlements',                   table: 'x402_settlements' },
  { link: 'ERC-8004',  label: 'reputation writes',             table: 'erc8004_reputation_writes' },
  { link: 'TrustShell',label: 'compliance receipts ISSUED',    table: 'kya_compliance_receipts' },
];

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

function classify(total, newest) {
  if (total === 0) return 'EMPTY';
  if (!newest) return 'NOT MEASURED';
  const days = (Date.now() - new Date(newest).getTime()) / 86_400_000;
  if (days <= 7) return 'LIVE';
  if (days <= 30) return 'COOLING';
  return 'STALE';
}

async function measure({ table }) {
  try {
    const { count, error: cErr } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (cErr) return { state: 'NOT MEASURED', detail: cErr.message };

    const { data, error: dErr } = await supabase
      .from(table)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (dErr) return { state: 'NOT MEASURED', detail: dErr.message, total: count };

    const newest = data?.[0]?.created_at ?? null;
    return { state: classify(count ?? 0, newest), total: count ?? 0, newest };
  } catch (e) {
    return { state: 'NOT MEASURED', detail: e?.cause?.code ?? e?.message ?? String(e) };
  }
}

const results = [];
for (const p of PILLARS) results.push({ ...p, ...(await measure(p)) });

const w = Math.max(...results.map((r) => r.label.length));
let unmeasured = 0;
let lastLink = null;

console.log('\nNORTH STAR — live state\n');
for (const r of results) {
  if (r.link !== lastLink) {
    console.log(`  ${r.link}`);
    lastLink = r.link;
  }
  if (r.state === 'NOT MEASURED') unmeasured++;
  const age = r.newest ? new Date(r.newest).toISOString().slice(0, 10) : '—';
  const total = r.total?.toLocaleString() ?? '—';
  console.log(
    `    ${r.label.padEnd(w)}  ${r.state.padEnd(13)} ${total.padStart(9)}  newest ${age}` +
      (r.detail ? `\n      ${r.detail}` : '')
  );
}

const receipts = results.find((r) => r.table === 'kya_compliance_receipts');
if (receipts && ['STALE', 'EMPTY'].includes(receipts.state)) {
  console.log(
    '\n  ⚠ TrustShell has issued no compliance receipt recently, while HAL and\n' +
      '    RepID are still writing. The harness is disconnected from its own live\n' +
      '    substrate — that gap is the v1. See NORTH-STAR.md.'
  );
}

if (unmeasured > 0) {
  console.log(
    `\n  ${unmeasured} pillar(s) NOT MEASURED — this run proves nothing about them.\n` +
      '  Expected from a cloud session: *.supabase.co is denied by the egress proxy.\n' +
      '  Run from a laptop.'
  );
  process.exit(2);
}

console.log('\n  Verdicts and the gap analysis live in NORTH-STAR.md.\n');
