// scripts/check-canonical-evidence.mjs — evidence is the truth, a lens is the interpretation.
//
// Drives the REAL evidence layer (lib/trustshell/evidence) and asserts the
// strategy §3.3 split as behaviour, not prose:
//
//   * A ROW STORES EVIDENCE, NEVER A SCORE — no score field; the store is
//     append-only (no update, no delete); integrity is hash-detectable.
//   * A LENS IS VERSIONED AND READS EVIDENCE — every reading carries its lens
//     id+version; an unmeasured metric is null/zero-credit, NEVER a default.
//   * CHANGE THE SCORE WITHOUT REWRITING HISTORY — two lenses over byte-identical
//     rows give two readings, and the rows are unchanged.
//
// Exit 0 VERIFIED, 1 a property regressed. NOT_CHECKED (exit 2) if it can't build.

import { compileAndImport } from './redteam/compile.mjs';

const FILES = [
  'lib/trustshell/EarnedMetrics.ts',
  'lib/trustshell/runtime/receipt.ts',
  'lib/trustshell/evidence/canonical-evidence.ts',
  'lib/trustshell/evidence/trust-lens.ts',
];

const c = await compileAndImport(FILES, [
  'lib/trustshell/evidence/canonical-evidence.ts',
  'lib/trustshell/evidence/trust-lens.ts',
  'lib/trustshell/runtime/receipt.ts',
]);
if (!c.ok) {
  console.error(`check:canonical-evidence — NOT_CHECKED: could not build the evidence layer: ${c.reason}`);
  process.exit(2);
}
const [EV, LENS, RCPT] = c.modules;
const {
  sealEvidenceRow,
  verifyEvidenceIntegrity,
  evidenceFromReceipt,
  InMemoryEvidenceStore,
  EVIDENCE_METRICS,
} = EV;
const { makeRepidLens, repidStandard23Lens } = LENS;
const { buildReceipt } = RCPT;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(`${m}: expected truthy, got ${JSON.stringify(v)}`);
};

const NOW = '2026-09-02T12:00:00.000Z';

/** Build a canonical row directly (a lens reads rows, not receipts). */
function row(over = {}) {
  return sealEvidenceRow({
    who: 'agent:a',
    forWhom: null,
    what: { capability: 'verify', tool: 'hal', targetResource: 'claim:1' },
    withWhat: 'composition:x',
    underWhatAuthority: { constitutionFingerprint: 'fnv:1', grantRef: null },
    argsHash: 'sha256:aa',
    verification: null,
    outcome: 'committed',
    metric: 'x402_success',
    success: true,
    latencyMs: null,
    domain: null,
    cost: null,
    taskId: 't1',
    parentTaskId: null,
    observedAt: '2026-09-01T12:00:00.000Z',
    ...over,
  });
}

// ── EVIDENCE: a row stores evidence, never a score ──────────────────────────
await check('a row carries evidence and NO score field', async () => {
  const r = row();
  for (const forbidden of ['score', 'reputation', 'rank', 'repid']) {
    eq(forbidden in r, false, `a row must not carry a baked '${forbidden}'`);
  }
  truthy('metric' in r && 'outcome' in r && 'who' in r, 'a row carries the raw evidence a lens reduces');
  truthy(typeof r.integrityHash === 'string' && r.integrityHash.startsWith('sha256:'), 'and an integrity hash');
});

await check('the store is APPEND-ONLY: no update, no delete, order preserved', async () => {
  const store = new InMemoryEvidenceStore();
  eq(typeof store.update, 'undefined', 'no update method exists');
  eq(typeof store.delete, 'undefined', 'no delete method exists');
  eq(typeof store.set, 'undefined', 'no set method exists');
  const a = row({ taskId: 't1' });
  const b = row({ taskId: 't2', who: 'agent:b' });
  store.append(a);
  store.append(b);
  eq(store.all().length, 2, 'both rows retained');
  eq(store.all()[0].taskId, 't1', 'append order preserved');
  eq(store.forSubject('agent:b').length, 1, 'forSubject filters by who');
  eq(store.forSubject('agent:a').length, 1, 'and does not leak across subjects');
});

await check('integrity hash detects tampering with a stored row', async () => {
  const r = row();
  truthy(verifyEvidenceIntegrity(r), 'a fresh row verifies');
  const tampered = { ...r, success: !r.success };
  eq(verifyEvidenceIntegrity(tampered), false, 'flipping success without re-sealing is detected');
});

// ── the receipt → evidence normalizer, and NO fabricated signal ─────────────
await check('evidenceFromReceipt maps a receipt and fabricates NO metric', async () => {
  const receipt = buildReceipt({
    requestId: 'r1',
    principal: 'agent:a',
    capability: 'fs.write',
    tool: 'file-write',
    targetResource: 'out.txt',
    argsHash: 'sha256:bb',
    constitutionFingerprint: 'fnv:2',
    composition: 'composition:x',
    decision: 'ALLOW',
    firedRule: null,
    evidence: null,
    executed: true,
    outcome: 'committed',
    outcomeDetail: 'wrote 3 bytes',
    at: NOW,
    nonce: 'n1',
  });
  const unclassified = evidenceFromReceipt(receipt);
  eq(unclassified.metric, null, 'an unclassified receipt bears on NO metric — never a fabricated signal');
  eq(unclassified.success, true, 'success defaults to "the executor committed"');
  eq(unclassified.who, 'agent:a', 'who = the principal');
  truthy(verifyEvidenceIntegrity(unclassified), 'the mapped row is sealed');
  const classified = evidenceFromReceipt(receipt, { metric: 'x402_success', success: true, domain: 'payments' });
  eq(classified.metric, 'x402_success', 'a caller with domain knowledge may classify');
  eq(classified.domain, 'payments', 'and scope it');
});

// ── LENS: versioned, reads evidence, no baked default ───────────────────────
await check('the default lens is versioned and stamps every reading', async () => {
  eq(repidStandard23Lens.id, 'repid-standard-2.3', 'the default lens id matches the strategy example');
  eq(repidStandard23Lens.version, '2.3', 'and its version');
  const reading = repidStandard23Lens.apply([row()], NOW);
  eq(reading.lensId, 'repid-standard-2.3', 'a reading names its lens');
  eq(reading.lensVersion, '2.3', 'and version — a reading with no lens identity is not a claim');
});

await check('an unmeasured metric is null / zero-credit, NEVER a default', async () => {
  const reading = repidStandard23Lens.apply([], NOW);
  for (const key of ['bftAccuracy', 'veritasCatchRate', 'x402SuccessRate', 'latencyMs']) {
    eq(reading.metrics[key].state, 'unmeasured', `${key} is unmeasured with no evidence`);
    eq(reading.metrics[key].value, null, `${key} value is null, not a filled-in default`);
  }
  eq(reading.states.unmeasured.length, 4, 'all four metrics report unmeasured');
  // EarnedMetrics' own coercion: unmeasured rate -> 0 credit; unmeasured latency -> worst point, never 0.
  eq(reading.scoringInputs.x402SuccessRate, 0, 'an unmeasured rate is ZERO credit, not a midpoint');
  eq(reading.scoringInputs.latencyMs, 2000, 'an unmeasured latency is the WORST value, not a perfect 0ms');
});

await check('a metric:null row moves NOTHING', async () => {
  const reading = repidStandard23Lens.apply([row({ metric: null, success: true })], NOW);
  eq(reading.metrics.x402SuccessRate.state, 'unmeasured', 'an unclassified row bears on no metric');
});

await check('the lens measures real evidence and dates the claim', async () => {
  const rows = [
    row({ metric: 'x402_success', success: true, observedAt: '2026-09-01T00:00:00.000Z' }),
    row({ metric: 'x402_success', success: true, observedAt: '2026-09-02T00:00:00.000Z' }),
    row({ metric: 'x402_success', success: false, observedAt: '2026-08-30T00:00:00.000Z' }),
  ];
  const reading = repidStandard23Lens.apply(rows, NOW);
  eq(reading.metrics.x402SuccessRate.state, 'measured', 'three recent outcomes are measurable');
  truthy(reading.metrics.x402SuccessRate.value > 0, 'and produce a positive rate');
  eq(reading.metrics.bftAccuracy.state, 'unmeasured', 'a metric with no rows stays unmeasured');
  eq(reading.evidenceThrough, '2026-09-02T00:00:00.000Z', 'the claim is dated to the newest evidence');
  eq(reading.rowsConsidered, 3, 'and reports how much evidence it weighed');
});

await check('the latency metric reduces to a decayed mean', async () => {
  const rows = [
    row({ metric: 'latency', latencyMs: 100, observedAt: '2026-09-02T00:00:00.000Z' }),
    row({ metric: 'latency', latencyMs: 300, observedAt: '2026-09-02T00:00:00.000Z' }),
  ];
  const reading = repidStandard23Lens.apply(rows, NOW);
  eq(reading.metrics.latencyMs.state, 'measured', 'latency samples are measurable');
  truthy(reading.metrics.latencyMs.value > 100 && reading.metrics.latencyMs.value < 300, 'a mean between the samples');
});

await check('read time matters: a later clock decays the same evidence further', async () => {
  const rows = [row({ metric: 'x402_success', success: true, observedAt: '2026-07-01T00:00:00.000Z' })];
  const near = repidStandard23Lens.apply(rows, '2026-07-02T00:00:00.000Z');
  const far = repidStandard23Lens.apply(rows, '2026-10-01T00:00:00.000Z');
  truthy(near.metrics.x402SuccessRate.freshnessDays < far.metrics.x402SuccessRate.freshnessDays, 'freshness grows with the clock');
  truthy(near.metrics.x402SuccessRate.effectiveN > far.metrics.x402SuccessRate.effectiveN, 'and effective weight decays');
});

// ── THE PAYOFF: two lenses over the SAME rows, history unchanged ─────────────
await check('two lenses give two readings over byte-identical evidence', async () => {
  const rows = [
    row({ metric: 'x402_success', success: true, observedAt: '2026-08-15T00:00:00.000Z' }),
    row({ metric: 'x402_success', success: false, observedAt: '2026-06-15T00:00:00.000Z' }),
  ];
  const before = rows.map((r) => r.integrityHash);
  const standard = repidStandard23Lens.apply(rows, NOW);
  const shortMemory = makeRepidLens('corporate-security', '1.0', { halfLifeDays: 3 }).apply(rows, NOW);
  // A 3-day half-life weights the old failure to almost nothing vs the 30-day default,
  // so the two lenses disagree on the SAME rows.
  truthy(
    standard.metrics.x402SuccessRate.effectiveN !== shortMemory.metrics.x402SuccessRate.effectiveN,
    'different decay -> different effective weight over the same evidence'
  );
  eq(shortMemory.lensId, 'corporate-security', 'the second reading names its own lens');
  const after = rows.map((r) => r.integrityHash);
  eq(JSON.stringify(before), JSON.stringify(after), 'and the EVIDENCE ROWS were not rewritten by either lens');
});

await check('domain scoping considers only in-domain rows', async () => {
  const rows = [
    row({ metric: 'x402_success', success: true, domain: 'payments' }),
    row({ metric: 'x402_success', success: false, domain: 'trading' }),
  ];
  const reading = repidStandard23Lens.apply(rows, NOW, 'payments');
  eq(reading.rowsConsidered, 1, 'only the in-domain row is weighed');
  eq(reading.domain, 'payments', 'the reading records its scope');
});

await check('EVIDENCE_METRICS is the closed runtime set', async () => {
  eq(EVIDENCE_METRICS.length, 4, 'four earned dimensions');
  truthy(EVIDENCE_METRICS.includes('latency'), 'including latency');
});

// ── hardening from independent verification (F1/F2/F3) ──────────────────────
await check('all() returns a COPY — the internal history cannot be mutated through it', async () => {
  const store = new InMemoryEvidenceStore();
  store.append(row({ taskId: 't1' }));
  store.append(row({ taskId: 't2' }));
  const snap = store.all();
  snap.length = 0; // try to delete the history through the returned array
  snap.push(row({ taskId: 'injected' }));
  eq(store.all().length, 2, 'the store is unaffected — append-only holds at runtime, not just in the type');
  eq(store.all()[0].taskId, 't1', 'and the original rows are intact and ordered');
});

await check('an UNRECOGNIZED metric bears on nothing instead of crashing the lens', async () => {
  // A corrupted persisted row could carry a metric the type forbids. The lens
  // must treat it as unclassified, never throw mid-reading.
  const bogus = row({ metric: 'not_a_real_metric' });
  const reading = repidStandard23Lens.apply([bogus], NOW);
  eq(reading.metrics.x402SuccessRate.state, 'unmeasured', 'an unknown metric contributes to no dimension');
  eq(reading.rowsConsidered, 1, 'the row is counted but bears on nothing');
});

await check('a lens with no id or version is refused at construction', async () => {
  let threw = false;
  try {
    makeRepidLens('', '2.3');
  } catch {
    threw = true;
  }
  eq(threw, true, 'an empty lensId is refused — a reading with no lens identity is not a claim');
  threw = false;
  try {
    makeRepidLens('x', '');
  } catch {
    threw = true;
  }
  eq(threw, true, 'an empty lensVersion is refused too');
});

console.log(`\ncheck:canonical-evidence — ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
console.log('check:canonical-evidence — VERIFIED');
process.exit(0);
