#!/usr/bin/env node
// scripts/check-pay-custody-shadow.mjs — ControlProof shadows the payment
// gate, and the shadow never becomes the gate.
//
// Run: node scripts/check-pay-custody-shadow.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE PROPERTY ────────────────────────────────────────────────────────────
//
// NEXT.md Tier 1 §1 / SPRINT-DECISIONS-2026-08-17.md P2: `app/api/trustrails/
// pay/route.ts` accepts an optional `controlProof` and observes what it would
// decide, alongside the live `kyaResult.humanCustodyBound` signal — the same
// shadow-mode pattern `VaultPermission.ts` already runs for the vault gate
// (`CustodyShadow.ts`, LESSONS A11). "Run them side by side first and measure
// disagreement" is the explicit instruction; this file is what makes that a
// property rather than a good intention.
//
// THE LOAD-BEARING CHECK is the last one: the observation is never captured
// into a variable. That is not a style preference — a captured result is a
// result something could branch on, and "the shadow decides" is the exact
// failure CustodyShadow.ts's own docstring names as the one that must not
// happen (LESSONS A11, "switching a live gate on the strength of a finding is
// how you lock five agents out of their vaults at 3am").
//
// ── WHY THIS IS A SOURCE-LEVEL CHECK, STATED PLAINLY ────────────────────────
//
// Same reason as check-pay-brief.mjs beside it: the route reaches Supabase
// through the `@/` alias and does not compile standalone. This proves the
// wiring, not the runtime behaviour — CustodyShadow's OWN runtime guarantees
// (never throws, records `not_comparable` honestly, distinguishes
// shadow_looser from shadow_stricter) are check-custody-shadow.mjs's job, not
// this file's. This file's job is narrower and unique to the call site: is the
// shadow actually wired in, with the right identity, and is it truly inert?

import { readFileSync } from 'node:fs';
import { createChecker } from './lib/harness-compile.mjs';

const { check, truthy, report } = createChecker('pay-custody-shadow');

import { barrelText } from './lib/barrel-text.mjs';

const read = (p) => readFileSync(p, 'utf8');
const ROUTE = 'app/api/trustrails/pay/route.ts';
const CUSTODY_SHADOW = 'lib/trustshell/CustodyShadow.ts';
const BARREL = 'lib/trustshell/index.ts';

const route = read(ROUTE);
const custodyShadowSrc = read(CUSTODY_SHADOW);
// The barrel is TWO files since 2026-08-19: `index.ts` re-exports `portable.ts`
// with `export *`, so reading index.ts alone reports CustodyShadow as missing
// while every consumer of '@/lib/trustshell' still sees it. Reachability is the
// invariant; the file was only ever the proxy.
const barrel = barrelText(BARREL);

/** Comments stripped, same technique and same reason as check-pay-brief.mjs:
 * this file's own prose mentions the exact identifiers it checks for. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const routeCode = stripComments(route);

// ── the request accepts a proof ─────────────────────────────────────────────

check('controlProof is destructured from the request body', () => {
  truthy(/const\s*\{[^}]*\bcontrolProof\b[^}]*\}\s*=\s*await\s+req\.json\(\)/.test(routeCode),
    'controlProof must be read from the same destructure as agentName/amountUSDC');
});

// ── the shadow is imported and constructed with the PAY identity, not the
//    vault's ──────────────────────────────────────────────────────────────

check('CustodyShadow and the PAY_* constants are imported', () => {
  truthy(/\bCustodyShadow\b/.test(routeCode), 'CustodyShadow must be imported');
  truthy(/\bPAY_AUDIENCE\b/.test(routeCode), 'PAY_AUDIENCE must be imported');
  truthy(/\bPAY_CAPABILITY\b/.test(routeCode), 'PAY_CAPABILITY must be imported');
  truthy(/\bPAY_ACTION\b/.test(routeCode), 'PAY_ACTION must be imported');
});

check('the barrel exports what the route imports', () => {
  // A route outside lib/trustshell/ can only reach what the barrel exports —
  // the same reachability rule spine-reachable-test.mjs polices for the spine
  // modules, checked here for this one because CustodyShadow is not in that
  // suite's named list.
  for (const name of ['CustodyShadow', 'PAY_AUDIENCE', 'PAY_CAPABILITY', 'PAY_ACTION']) {
    truthy(new RegExp(`\\b${name}\\b`).test(barrel), `${name} must be exported from the barrel`);
  }
});

check('the instance is built with the PAY identity, not the vault defaults', () => {
  // `[^)]*` would stop at the first `)`, which the getClient thunk `() => …`
  // supplies before the real arguments even start — matched to end-of-line
  // instead, since the constructor call is written on one line.
  const m = routeCode.match(/new CustodyShadow\((.*)\);/);
  truthy(m, 'new CustodyShadow(...) must appear in the route');
  const args = m[1];
  truthy(/PAY_AUDIENCE/.test(args), 'must pass PAY_AUDIENCE — the default is the VAULT audience');
  truthy(/PAY_CAPABILITY/.test(args), 'must pass PAY_CAPABILITY — the default is the VAULT capability');
  truthy(/PAY_ACTION/.test(args), 'must pass PAY_ACTION — the default is the VAULT action label, ' +
    'and sharing it would dilute VaultPermission’s own shadow-analysis query');
  truthy(!/VAULT_AUDIENCE|VAULT_CAPABILITY|VAULT_ACTION/.test(args),
    'must not pass a VAULT_* constant — that would shadow the payment gate against the wrong audience');
});

check('CustodyShadow is not constructed at module scope', () => {
  // lib/CLAUDE.md: a client built at import time fails the build before a
  // single request is served. `new CustodyShadow(` must appear inside the
  // handler body, i.e. after `export async function POST`.
  const fnStart = routeCode.indexOf('export async function POST');
  const ctorAt = routeCode.indexOf('new CustodyShadow(');
  truthy(fnStart !== -1 && ctorAt > fnStart,
    'CustodyShadow must be constructed inside POST(), not at module scope');
});

// ── the observed signal is the real one ─────────────────────────────────────

check('legacyCustodyVerified reads the same field the RepID calc and receipt use', () => {
  truthy(/legacyCustodyVerified:\s*kyaResult\.humanCustodyBound/.test(routeCode),
    'the shadow must observe kyaResult.humanCustodyBound — the field this whole ' +
    'change exists to eventually replace, per control-proof.ts’s own docstring');
});

check('controlProof is passed through to the shadow, not dropped', () => {
  const obsBlock = routeCode.slice(routeCode.indexOf('.observe({'), routeCode.indexOf('.observe({') + 400);
  truthy(/controlProof(?:\s*,|\s*\})/.test(obsBlock),
    'the destructured controlProof must reach custodyShadow.observe(...)');
});

// ── THE LOAD-BEARING CHECK: the shadow cannot become the gate ───────────────

check('the observation is never captured — nothing downstream can branch on it', () => {
  // Structural, not behavioural: if `custodyShadow.observe(...)` is never
  // assigned to an identifier, there is no variable left for a later `if` to
  // read. This is the strongest available guarantee that shadow mode stays
  // shadow mode without re-deriving CustodyShadow's own runtime tests here.
  truthy(/(?<![=\w])await custodyShadow\.observe\(/.test(routeCode),
    'custodyShadow.observe(...) must be a bare awaited statement');
  truthy(!/(?:const|let|var)\s+\w+\s*=\s*await\s+custodyShadow\.observe\(/.test(routeCode),
    'the observation must NOT be captured into a variable — a captured result ' +
    'is a result something could gate on, which is the exact failure this ' +
    'shadow exists to avoid until a real cutover decision is made');
});

check('no response field or conditional reads from a shadow observation', () => {
  // Belt and suspenders on the check above: even a captured-but-unused-looking
  // variable named plausibly (`shadowResult`, `custodyObservation`) must not
  // reach a response body or an `if`.
  truthy(!/\b(shadowResult|custodyObservation|shadowVerdict)\b/.test(routeCode),
    'no shadow-observation variable name should appear anywhere in the route');
});

// ── the generalisation kept the vault path’s defaults intact ───────────────

check('CustodyShadow’s constructor still defaults to the VAULT identity', () => {
  // The whole point of parameterising rather than duplicating the class: every
  // pre-existing call site (VaultPermission.ts, all of check-custody-shadow.mjs)
  // must keep working with zero changes. Verified here at the type level so a
  // future edit that drops the defaults is caught before it reaches
  // VaultPermission's own suite.
  truthy(/audience:\s*string\s*=\s*VAULT_AUDIENCE/.test(custodyShadowSrc),
    'audience must default to VAULT_AUDIENCE');
  truthy(/capability:\s*string\s*=\s*VAULT_CAPABILITY/.test(custodyShadowSrc),
    'capability must default to VAULT_CAPABILITY');
  truthy(/actionLabel:\s*string\s*=\s*VAULT_ACTION/.test(custodyShadowSrc),
    'actionLabel must default to VAULT_ACTION');
});

report();
