#!/usr/bin/env node
// scripts/check-hal-chain.mjs — the HAL classification chain verifier.
//
// Run: node scripts/check-hal-chain.mjs
//
// `previous_entry_hash` has been written since 2026-06-02 and carried into
// every compliance receipt, and NOTHING HAS EVER VERIFIED IT. This is the
// verifier; these are the assertions that decide whether it is worth having.
//
// The one that carries the file:
//
//   * 'A STRUCTURALLY SOUND CHAIN WITH NO HASHER IS NOT_CHECKED' — the state
//     the live chain is actually in. Ordering holds, links are distinct, there
//     is no break after the cutover, and not one link has been recomputed.
//     Reporting VERIFIED there is the exact defect this file exists to close,
//     and it is the tempting one because everything visible looks fine.
//
// And the ones that stop it being decorative:
//
//   * 'a NULL link before the cutover is ADOPTION, after it is a BREAK' — the
//     boundary is what lets 44,769 legitimate pre-chaining rows coexist with a
//     real check. Without it the verifier cries wolf 44,769 times and gets
//     switched off, taking the genuine check with it.
//   * 'ORDER IS CHECKED, NOT ASSUMED' — this repo has a retraction from an
//     `id desc` query that assumed id tracked time.
//   * 'a hasher that THROWS is NOT_CHECKED, not a mismatch' — a broken formula
//     must not read as a broken chain.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.hal-chain-check-'));
let m;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/hal-chain.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
      '--module', 'commonjs', '--target', 'es2022',
      '--lib', 'es2022,dom', '--moduleResolution', 'node',
      '--esModuleInterop', '--strict',
    ],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'hal-chain.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('hal-chain compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { verifyHalChain, CHAIN_CUTOVER_ISO } = m;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };

// ── fixtures ────────────────────────────────────────────────────────────────

const AFTER = '2026-07-01T09:15:00.000Z';
const BEFORE = '2026-05-15T09:15:00.000Z';

/** A stand-in formula, so the verifier's link path can be exercised. */
const hasher = (e) => createHash('sha256').update(`hal|${e.id}|${e.prompt_hash}`).digest('hex');

const entry = (id, over = {}) => ({
  id,
  prompt_hash: `ph${id}`,
  category: 'factual',
  confidence: 'high',
  latency_ms: 0,
  provider: 'deepseek',
  model: 'quorum',
  created_at: new Date(Date.parse(AFTER) + id * 86_400_000).toISOString(),
  previous_entry_hash: null,
  ...over,
});

/** A well-formed run of `n` entries, correctly linked under `hasher`. */
const chain = (n, startId = 1) => {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const e = entry(startId + i);
    e.previous_entry_hash = i === 0 ? `genesis-${startId}` : hasher(out[i - 1]);
    out.push(e);
  }
  return out;
};

/**
 * A GENUINELY anchored run: entry 0 is a true genesis (null link, dated
 * BEFORE the cutover — proven adoption, not a placeholder), and every entry
 * after it chains normally under `hasher`. Distinct from `chain()`, whose
 * entry 0 carries a synthetic external link standing in for a page boundary.
 */
const genesisChain = (n, startId = 1) => {
  const out = [entry(startId, { created_at: BEFORE, previous_entry_hash: null })];
  for (let i = 1; i < n; i += 1) {
    const e = entry(startId + i);
    e.previous_entry_hash = hasher(out[i - 1]);
    out.push(e);
  }
  return out;
};

// ── the assertion that carries the file ─────────────────────────────────────

check('A STRUCTURALLY SOUND CHAIN WITH NO HASHER IS NOT_CHECKED', () => {
  // The state the live chain is actually in, and the tempting failure: nothing
  // visible is wrong, so it looks verified. Structure is not integrity.
  const r = verifyHalChain(chain(5));
  eq(r.outcome, 'NOT_CHECKED', 'structural soundness alone must not read as verified');
  eq(r.defects.length, 0, 'and there is genuinely nothing wrong with it');
  eq(r.linksVerified, 0, 'because not one link was recomputed');
  match(r.detail, /NOT ONE LINK WAS RECOMPUTED/, 'the detail must say so in terms');
  match(r.detail, /Structure is not integrity/, 'and name the distinction');
});

check('an UNANCHORED window stays NOT_CHECKED even with every inside link matching (HAL-001)', () => {
  // `chain()`'s entry 0 carries a synthetic external link — standing in for a
  // real chain's first row when a query only returns a PAGE of it. Every link
  // INSIDE the window recomputes and matches, but the window's own beginning
  // was never shown to this verifier — indistinguishable from a truncation
  // attack (delete the head, the tail is still internally consistent). Until
  // 2026-08-17 this asserted VERIFIED here, which was HAL-001: the red team's
  // reachability search found that was the ONLY way this function could ever
  // reach VERIFIED, meaning every VERIFIED it emitted was over an unanchorable
  // window. Fixed by capping the outcome on `windowStartUnverifiable`, below.
  const r = verifyHalChain(chain(5), { hasher });
  eq(r.outcome, 'NOT_CHECKED', 'an unanchored window must not claim VERIFIED, however clean the inside is');
  eq(r.linksVerified, 4, 'four links between five entries still recomputed and matched');
  eq(r.linksNotChecked, 0, 'nothing INSIDE the window was left unchecked — the cap is about the boundary');
  eq(r.windowStartUnverifiable, true, 'the window boundary is reported, not hidden');
  match(r.detail, /UNANCHORED/, 'the detail must name why, not just say NOT_CHECKED');
});

check('a TRUE GENESIS window — provably the beginning — reaches VERIFIED (HAL-001)', () => {
  // The other half of the fix: entry 0 here is a real pre-cutover adoption row
  // (null link, dated before chaining began), which is NOT the same fact as
  // `chain()`'s synthetic external link above — there is nothing behind this
  // null to hide, because chaining did not exist yet, and the row's own
  // timestamp is the proof. Every link past it recomputes and matches, and now
  // nothing caps the outcome. This is the counterexample that used to be
  // unreachable: an anchored VERIFIED that HAL-001's search could not find.
  const r = verifyHalChain(genesisChain(6), { hasher });
  eq(r.outcome, 'VERIFIED', 'a genuinely anchored, fully recomputed chain verifies');
  eq(r.linksVerified, 5, 'five links between six entries');
  eq(r.linksNotChecked, 0, 'the genesis entry is not a gap — there was nothing there to check');
  eq(r.windowStartUnverifiable, false, 'the start is anchored — proven, not merely assumed');
});

check('A PARTIALLY VERIFIED CHAIN IS NOT A VERIFIED ONE', () => {
  // One unrecomputable link in the middle caps the whole run. Built on
  // genesisChain (anchored), not chain (unanchored), so this isolates the
  // mid-window-gap failure from the boundary failure two tests up — otherwise
  // an unanchored window with an ALSO-flaky hasher would report "UNANCHORED",
  // not this message, and the assertion below would be testing the wrong path.
  // A formula that cannot render ONE entry: realistic, and the only way to get
  // a genuine mid-window gap without also breaking the chain.
  const c = genesisChain(6);
  const flaky = (e) => { if (e.id === c[3].id) throw new Error('shape not supported'); return hasher(e); };
  const r = verifyHalChain(c, { hasher: flaky });
  truthy(r.linksVerified > 0, 'some links were checked');
  truthy(r.linksNotChecked > 0, 'and some were not');
  eq(r.outcome, 'NOT_CHECKED', 'so the run is not verified');
  eq(r.windowStartUnverifiable, false, 'this window IS anchored — the failure is the gap, not the boundary');
  match(r.detail, /partially verified chain is not a verified one/, 'reason');
});

// ── the cutover boundary ────────────────────────────────────────────────────

check('a NULL link BEFORE the cutover is ADOPTION, not a defect', () => {
  // 44,769 live rows predate chaining. A verifier that flags them cries wolf
  // 44,769 times and gets switched off, taking the real check with it.
  const c = [entry(1, { created_at: BEFORE, previous_entry_hash: null })];
  const r = verifyHalChain(c);
  eq(r.defects.length, 0, 'a pre-chaining row is not a break');
  eq(r.outcome, 'NOT_CHECKED', 'but nothing was verified either');
});

check('a NULL link AFTER the cutover is a BREAK', () => {
  const c = chain(3);
  c[2].previous_entry_hash = null;   // dated after the cutover by construction
  const r = verifyHalChain(c, { hasher });
  eq(r.outcome, 'FAILED', 'a live chain that lost a link has failed');
  eq(r.defects[0].kind, 'missing_link_after_cutover', 'named as a break');
  match(r.defects[0].detail, /this is a break, not adoption/, 'and distinguished from adoption');
});

check('the cutover boundary is INCLUSIVE of the first chained instant', () => {
  // The measured first chained row is exactly CHAIN_CUTOVER_ISO. A row at that
  // instant with no link is a break, not the last of the old era.
  const c = [entry(1, { created_at: CHAIN_CUTOVER_ISO, previous_entry_hash: null })];
  eq(verifyHalChain(c).defects[0]?.kind, 'missing_link_after_cutover', 'at the boundary it is a break');
  const justBefore = new Date(Date.parse(CHAIN_CUTOVER_ISO) - 1).toISOString();
  const c2 = [entry(1, { created_at: justBefore, previous_entry_hash: null })];
  eq(verifyHalChain(c2).defects.length, 0, 'one millisecond earlier it is adoption');
});

// ── structural defects that need no formula ─────────────────────────────────

check('TWO ENTRIES CLAIMING ONE PREDECESSOR IS A FORK', () => {
  // Detectable without the formula, and the live table passes it: all 102,934
  // links are distinct.
  const c = chain(3);
  c[2].previous_entry_hash = c[1].previous_entry_hash;
  const r = verifyHalChain(c);
  eq(r.outcome, 'FAILED', 'a fork must fail');
  eq(r.defects[0].kind, 'duplicate_link', 'named');
  match(r.defects[0].detail, /two entries cannot follow one/, 'reason');
});

check('ORDER IS CHECKED, NOT ASSUMED', () => {
  // This repo has a retraction from an `id desc` query that assumed id tracked
  // time. Ordering is taken from created_at and verified.
  const c = chain(3);
  const swapped = [c[0], c[2], c[1]];
  const r = verifyHalChain(swapped);
  eq(r.outcome, 'FAILED', 'out-of-order entries must fail');
  truthy(r.defects.some((d) => d.kind === 'out_of_order'), 'named as out of order');
});

check('an unparseable timestamp is a defect, not a silent skip', () => {
  const c = chain(2);
  c[1].created_at = 'not-a-date';
  const r = verifyHalChain(c);
  truthy(r.defects.some((d) => d.kind === 'out_of_order'), 'position unknown must be reported');
});

check('a link that does not match the recomputed predecessor FAILS', () => {
  const c = chain(3);
  c[2].previous_entry_hash = 'f'.repeat(64);
  const r = verifyHalChain(c, { hasher });
  eq(r.outcome, 'FAILED', 'a tampered link must fail');
  eq(r.defects[0].kind, 'link_mismatch', 'named');
  match(r.defects[0].detail, /does not match the recomputed hash/, 'reason');
});

// ── the verifier's own failure modes ────────────────────────────────────────

check('AN EMPTY WINDOW IS NOT A CLEAN ONE', () => {
  // Nothing examined is not everything sound — the same rule as a handoff with
  // no checkpoints.
  const r = verifyHalChain([]);
  eq(r.outcome, 'NOT_CHECKED', 'an empty window verifies nothing');
  match(r.detail, /An empty window is not a clean one/, 'and must say so');
});

check('A HASHER THAT THROWS IS NOT_CHECKED, not a mismatch', () => {
  // A broken formula must not read as a broken chain — that would send someone
  // hunting for tampering that never happened.
  const r = verifyHalChain(chain(3), { hasher: () => { throw new Error('formula unavailable'); } });
  eq(r.outcome, 'NOT_CHECKED', 'a crashed hasher establishes nothing');
  eq(r.defects.length, 0, 'and must not manufacture defects');
  eq(r.linksVerified, 0, 'nothing was verified');
});

check('every defect names the entry it was found at', () => {
  // "The chain is broken" is not actionable across 102,934 rows.
  const c = chain(4);
  c[2].previous_entry_hash = 'f'.repeat(64);
  const r = verifyHalChain(c, { hasher });
  for (const d of r.defects) {
    truthy(typeof d.entryId === 'number', 'entryId must be present');
    truthy(d.detail.length > 20, 'and the detail must be more than a label');
  }
  eq(r.defects[0].entryId, c[2].id, 'pointing at the offending entry');
});

check('the summary names the first defects and counts the rest', () => {
  const c = chain(12);
  for (let i = 1; i < 12; i += 1) c[i].previous_entry_hash = 'f'.repeat(64);
  const r = verifyHalChain(c, { hasher });
  eq(r.outcome, 'FAILED', 'many defects still fail');
  match(r.detail, /and \d+ more/, 'the summary must not print all of them, but must count them');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nhal-chain: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All hal-chain checks passed.');
