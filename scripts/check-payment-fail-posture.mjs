// scripts/check-payment-fail-posture.mjs
//
// The payment path applies TWO checks with DELIBERATELY OPPOSITE failure
// postures, and neither was gated by anything.
//
//   RepID threshold unreadable  ->  DENY   (503, approved:false)
//   BFT consensus not evaluated ->  ALLOW  (approved:true, disclosed)
//
// Both are defensible and both are documented in place. The threshold check
// reasons that "a limit that could not be evaluated is not a limit that
// passed" — an unreadable institution config used to silently become 5000,
// which for an institution storing a STRICTER number is a fail-open reached by
// an outage. The BFT check reasons the other way: a provider outage is not a
// consensus failure, and refusing a legitimate payment because a third party is
// down is its own harm.
//
// WHAT MAKES THE FAIL-OPEN ACCEPTABLE IS THE DISCLOSURE, AND ONLY THAT. The
// response carries `bft.evaluated:false`, `status:'NOT CHECKED'`, the mode, and
// appends "BFT consensus NOT CHECKED." to the message. Strip any of that and
// the route reports a consensus-authorised payment for a vote that never ran —
// which is this repo's defining defect, and precisely what BFTAuthorizer
// replaced: a 16-line placeholder returning `passed:true` with a consensus
// weight of 1.0, which is why all 12 rows in kya_compliance_receipts claim BFT
// consensus and `pythagorean_veto` has never once been true.
//
// So the invariant this file exists to hold is not "BFT must pass". It is:
//
//   evaluated === false  =>  the caller is TOLD, every time, in the payload.
//
// Nothing asserted any of this before: no suite drove BFTAuthorizer.authorize,
// and nothing pinned the route's deny-on-null-threshold.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.payment-posture-check-'));
let A, ENGINE;
try {
  // `@/` alias resolution, same approach as bft-judge-test.mjs — BFTAuthorizer
  // reaches the engine and the Supabase helper through it.
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022', 'dom'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: false,
        baseUrl: process.cwd(), paths: { '@/*': ['./*'] },
      },
      files: [join(process.cwd(), 'lib/trustshell/BFTAuthorizer.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });

  // `paths` is COMPILE-time only: the emitted JS still requires "@/lib/...",
  // which Node cannot resolve. bft-judge-test.mjs sidesteps this because its
  // aliased imports are TYPES and erase; BFTAuthorizer imports VALUES.
  //
  // So the two dependencies are substituted here. This is not a workaround for
  // the alias — it is the point. A controllable engine is the only way to drive
  // the enforce-mode OUTAGE path, which is where the fail-open actually lives.
  // The module under test is the real, unmodified BFTAuthorizer.
  const emitted = join(outDir, 'lib', 'trustshell', 'BFTAuthorizer.js');
  const enginePath = join(outDir, 'engine-stub.cjs');
  const adminPath = join(outDir, 'admin-stub.cjs');
  writeFileSync(
    enginePath,
    // Behaviour is swapped per test by assigning `module.exports.__impl`.
    'module.exports = { bftEngine: { authorizePayment: async (r) => module.exports.__impl(r) },' +
      " __impl: async () => { throw new Error('no impl set'); } };\n"
  );
  writeFileSync(
    adminPath,
    // authorize() must never reach persistence. If it does, this throws and the
    // suite fails rather than quietly talking to a real client.
    "module.exports = { getSupabaseAdmin: () => { throw new Error('authorize() must not touch Supabase'); } };\n"
  );
  writeFileSync(
    emitted,
    readFileSync(emitted, 'utf8')
      .replace(/require\("@\/lib\/trust\/BFTEngine"\)/g, `require(${JSON.stringify(enginePath)})`)
      .replace(/require\("@\/lib\/supabase-admin"\)/g, `require(${JSON.stringify(adminPath)})`)
  );
  A = await import(pathToFileURL(emitted).href);
  ENGINE = (await import(pathToFileURL(enginePath).href)).default;
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error(e.stdout?.toString() || e.message);
  throw e;
}

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
  if (!v) throw new Error(m);
};

const ROUTE = readFileSync('app/api/trustrails/pay/route.ts', 'utf8');

// ── the mode itself ─────────────────────────────────────────────────────────

await check('enforcement defaults to OBSERVE, and only an exact match enables it', async () => {
  const original = process.env.BFT_ENFORCEMENT_MODE;
  try {
    delete process.env.BFT_ENFORCEMENT_MODE;
    eq(A.bftEnforcementMode(), 'observe', 'unset must be observe');
    // Anything short of the exact word must NOT enable inline gating. A typo
    // silently turning enforcement ON would add seconds of third-party latency
    // to every transfer; a typo turning it OFF is the dangerous direction and
    // is the one this pins.
    for (const v of ['', 'ENFORCE', 'enforce ', 'true', '1', 'observe']) {
      process.env.BFT_ENFORCEMENT_MODE = v;
      eq(A.bftEnforcementMode(), 'observe', `"${v}" must not enable enforcement`);
    }
    process.env.BFT_ENFORCEMENT_MODE = 'enforce';
    eq(A.bftEnforcementMode(), 'enforce', 'the exact word enables it');
  } finally {
    if (original === undefined) delete process.env.BFT_ENFORCEMENT_MODE;
    else process.env.BFT_ENFORCEMENT_MODE = original;
  }
});

// ── the fail-open, and the disclosure that is its whole justification ────────

async function observeProof() {
  const original = process.env.BFT_ENFORCEMENT_MODE;
  delete process.env.BFT_ENFORCEMENT_MODE;
  try {
    return await new A.BFTAuthorizer().authorize('pay-1', 'agent-x', 100, 5000, 'transfer');
  } finally {
    if (original !== undefined) process.env.BFT_ENFORCEMENT_MODE = original;
  }
}

await check('observe mode DOES NOT BLOCK — the fail-open, stated plainly', async () => {
  const p = await observeProof();
  eq(p.passed, true, 'observe mode must not block the payment');
  eq(p.evaluated, false, 'and must NOT claim the vote happened');
});

await check('THE INVARIANT: not evaluated => the caller is told, in the payload', async () => {
  const p = await observeProof();
  truthy(
    typeof p.notEvaluatedReason === 'string' && p.notEvaluatedReason.length > 0,
    'evaluated:false MUST carry a non-empty notEvaluatedReason'
  );
  // `passed:true` alone is indistinguishable from a real consensus. The pairing
  // is what stops "approved" reading as "authorised by three providers".
  truthy(
    /not a consensus result|observe|queued/i.test(p.notEvaluatedReason),
    `the reason must say a vote did not happen, got: ${p.notEvaluatedReason}`
  );
});

await check('observe mode INVENTS NO EVIDENCE for the vote it did not hold', async () => {
  const p = await observeProof();
  // The placeholder this replaced returned consensusWeight 1.0 for a vote that
  // never happened. A number here is worse than a null: it is auditable-looking.
  eq(p.consensusWeight, null, 'no consensus weight may be reported');
  eq(p.votesFor.length, 0, 'no votes for');
  eq(p.votesAgainst.length, 0, 'no votes against');
  eq(p.pythagoreanVeto, false, 'no veto claim');
  truthy(typeof p.votedAt === 'string' && p.votedAt.length > 0, 'the attempt is still timestamped');
});

// ── the opposite posture, on the same request ───────────────────────────────

await check('THE ROUTE DENIES when the RepID threshold is UNREADABLE', async () => {
  // The fail-closed half. An unreadable institution config must not become a
  // default, because for an institution storing a stricter number a default
  // LOWERS the bar — a fail-open reached by an outage rather than by any input.
  truthy(
    /repidResult\.threshold === null \|\| repidResult\.meetsThreshold === null/.test(ROUTE),
    'the null-threshold guard must be present'
  );
  const guard = ROUTE.slice(ROUTE.indexOf('repidResult.threshold === null'));
  const body = guard.slice(0, guard.indexOf('}, {') + 40);
  truthy(/approved:\s*false/.test(body), 'it must DENY, not default');
  truthy(/status:\s*503/.test(body), 'and answer 503, not 200');
  truthy(/NOT_CHECKED/.test(body), 'and say NOT_CHECKED rather than "failed"');
});

await check('AN APPROVED PAYMENT CANNOT HIDE THAT CONSENSUS NEVER RAN', async () => {
  // Everything after the success `return NextResponse.json({ approved: true`.
  const success = ROUTE.slice(ROUTE.indexOf('approved:     true'));
  truthy(/evaluated:\s*bftProof\.evaluated/.test(success), 'the payload must carry evaluated');
  truthy(/'NOT CHECKED'/.test(success), "and the literal 'NOT CHECKED' status");
  truthy(/mode:\s*bftEnforcementMode\(\)/.test(success), 'and name the mode it ran under');
  truthy(
    /BFT consensus NOT CHECKED/.test(success),
    'and say so in the human-readable message, not only in a nested field'
  );
});

await check('the two postures are BOTH present — the asymmetry is the design', async () => {
  // A refactor that "made the checks consistent" would silently pick one:
  // denying on a provider outage, or approving on an unreadable limit. Both
  // regressions look like cleanups, so both directions are pinned here.
  truthy(/if \(!bftProof\.passed\)/.test(ROUTE), 'BFT gates on passed (fail-open when unevaluated)');
  truthy(/approved: false,\s*\n\s*stage: 'repid_threshold'/.test(ROUTE), 'threshold denies (fail-closed)');
});

// ── enforce mode: the outage path IS the fail-open ──────────────────────────

async function enforceProof(impl) {
  const original = process.env.BFT_ENFORCEMENT_MODE;
  process.env.BFT_ENFORCEMENT_MODE = 'enforce';
  ENGINE.__impl = impl;
  try {
    return await new A.BFTAuthorizer().authorize('pay-2', 'agent-x', 100, 5000, 'transfer');
  } finally {
    if (original === undefined) delete process.env.BFT_ENFORCEMENT_MODE;
    else process.env.BFT_ENFORCEMENT_MODE = original;
  }
}

await check('ENFORCE + provider outage: does not block, and says the vote never ran', async () => {
  const p = await enforceProof(async () => {
    throw new Error('groq timeout');
  });
  eq(p.passed, true, 'an outage must not refuse a legitimate payment');
  eq(p.evaluated, false, 'and must not claim a vote');
  eq(p.consensusWeight, null, 'and must invent no weight');
  truthy(/groq timeout/.test(p.notEvaluatedReason), `the reason must name the failure: ${p.notEvaluatedReason}`);
  truthy(/unavailable/i.test(p.notEvaluatedReason), 'and mark it as unavailability');
});

await check('ENFORCE + real consensus: the verdict is REPORTED, not assumed', async () => {
  const reached = await enforceProof(async () => ({
    consensus_reached: true, consensus_score: 0.9, threshold: 0.618033988749895,
    pythagorean_veto_fired: false, dissenting_providers: [],
    votes: [{ provider: 'alpha', belief: 0.9, disbelief: 0.1 }],
  }));
  eq(reached.evaluated, true, 'a real run is marked evaluated');
  eq(reached.passed, true, 'and passes when consensus is reached');
  eq(reached.consensusWeight, 0.9, 'and carries the real weight');

  const refused = await enforceProof(async () => ({
    consensus_reached: false, consensus_score: 0.2, threshold: 0.618033988749895,
    pythagorean_veto_fired: true, dissenting_providers: ['beta', 'gamma'],
    votes: [{ provider: 'alpha', belief: 0.2, disbelief: 0.8 }],
  }));
  eq(refused.evaluated, true, 'a refusal is also evaluated');
  eq(refused.passed, false, 'and it BLOCKS — enforce mode is not decorative');
  eq(refused.pythagoreanVeto, true, 'the veto is surfaced');
  eq(refused.votesAgainst.length, 2, 'dissenters are named');
});

await check('THE INVARIANT HOLDS ON EVERY PATH, not just the one sampled', async () => {
  const proofs = [
    await observeProof(),
    await enforceProof(async () => { throw new Error('down'); }),
    await enforceProof(async () => ({
      consensus_reached: true, consensus_score: 0.8, threshold: 0.618033988749895,
      pythagorean_veto_fired: false, dissenting_providers: [], votes: [],
    })),
  ];
  for (const p of proofs) {
    if (p.evaluated) {
      truthy(p.consensusWeight !== null, 'an evaluated proof must carry a weight');
    } else {
      truthy(p.passed === true, 'an unevaluated proof does not block');
      truthy(
        typeof p.notEvaluatedReason === 'string' && p.notEvaluatedReason.length > 0,
        'and ALWAYS discloses why — this is the whole justification for the fail-open'
      );
      eq(p.consensusWeight, null, 'and never reports a weight it did not compute');
    }
  }
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\npayment-fail-posture: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — a payment failure posture changed.\n');
  process.exit(1);
}
console.log(
  'check:payment-fail-posture — VERIFIED. Threshold fails CLOSED, BFT fails OPEN\n' +
    '  and always discloses it.\n' +
    '\n  NOT CHECKED: the three real providers. Enforce mode is driven through a\n' +
    '  substituted engine, so this proves how BFTAuthorizer HANDLES a verdict,\n' +
    '  an outage and a refusal — not that the panel itself votes well.\n'
);
