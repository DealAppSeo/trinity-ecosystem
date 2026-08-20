// scripts/check-lane-files.mjs
//
// Measure the four mandatory lane artifacts, and render the promotion table
// FROM THE MEASUREMENT.
//
// ── THE CLAIM, AND WHAT LOOKING FOUND ───────────────────────────────────────
//
// "The four required files have now landed." Two had:
// `docs/policy/authority-policy.v0.5.yaml` and `docs/policy/anfis-objective.md`,
// in `48a1e2f` on `xc/policy-lock`. The other two —
// `docs/contracts/events.v1.json` and
// `docs/contracts/capability-declaration.schema.json` — did not exist at any
// path on any ref in the repository (`git log --all --diff-filter=A` returns
// nothing for either).
//
// That is the entire reason this file runs `existsSync` before anything else,
// and the reason the harness renders NOT CHECKED rather than omitting a row: a
// registry built from a handed-over list reports four registered artifacts and
// has measured none of them.
//
// ── WHAT IS ACTUALLY MEASURED, NOT NODDED AT ────────────────────────────────
//
// The strong checks recompute the document's own numbers from the document's
// own formulas. `authority-policy.v0.5.yaml` publishes
// `δ_raw(n) = 20·(2/(n+1))`, a rank clamp, and five worked values — all five are
// derivable, and a hand-edit that breaks one is invisible to review. Weight
// vectors are summed. Status buckets are checked for overlap, because a surface
// listed as both `live` and `blocked` is two claims, not a typo.
//
// The document's OWN `status.live` list is extracted and then REFUSED as
// evidence: it is an asserted stage, which is the thing `promotion.ts` exists to
// prevent. Each entry must resolve to a check suite in this repo that actually
// runs, or the claim is reported unbacked.
//
// Three outcomes. A file that is absent is NOT CHECKED, never a failure of the
// lane's content — we have not seen the content.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import yaml from 'js-yaml';

const outDir = mkdtempSync(join(process.cwd(), '.lane-files-check-'));
let L, P;
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [
        join(process.cwd(), 'lib/trustshell/lane-files.ts'),
        join(process.cwd(), 'lib/trustshell/promotion.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  L = await import(pathToFileURL(join(outDir, 'lib/trustshell/lane-files.js')).href);
  P = await import(pathToFileURL(join(outDir, 'lib/trustshell/promotion.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lane-files.ts / promotion.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

let pass = 0;
const failures = [];
const skipped = [];
/**
 * `true` passes, a string fails, and SKIPPED is its own answer.
 *
 * The anfis/policy cross-check returned `true` when the policy file failed to
 * parse — "nothing to compare against" scored as agreement, and the routing doc
 * came out SOFT-LIVE on a comparison that never ran. That is the two-outcome
 * collapse inside the gate built to prevent it. Caught on this suite's second
 * run.
 */
const SKIP = Symbol('skipped');
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    if (r === SKIP) { skipped.push(name); return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

// ── 1. The module's own arithmetic, independent of any file ─────────────────
//
// Asserted first and separately: if the recomputation is wrong, every verdict
// it produces about a lane's file is worthless. Same rule the package-boundary
// extractor follows.

check('referralDelta reproduces the locked curve at every published rank', () => {
  const expected = { 1: 12, 2: 8, 3: 8, 10: 4, 100: 0 };
  for (const [n, d] of Object.entries(expected)) {
    const got = L.referralDelta(Number(n));
    if (got !== d) return `δ(${n}) = ${got}, expected ${d}`;
  }
  return true;
});

check('the clamp, not the curve, is what caps δ at n=1', () =>
  L.referralRaw(1) === 20 && L.referralClamp(1) === 12 && L.referralDelta(1) === 12
    ? true
    : `raw ${L.referralRaw(1)}, clamp ${L.referralClamp(1)}, δ ${L.referralDelta(1)}`);

check('referralDisagreements CATCHES a wrong worked value', () => {
  const bad = L.referralDisagreements([{ n: 1, raw: 20, delta: 20 }]);
  return bad.length > 0 ? true : 'accepted δ(1)=20 against a clamp of 12';
});

check('bucketOverlaps catches a surface claimed twice', () => {
  const o = L.bucketOverlaps({ live: ['x'], blocked: ['x'] });
  return o.length === 1 ? true : `reported ${o.length} overlaps for one duplicate`;
});

check('sumsToOne rejects a weight vector that does not', () =>
  L.sumsToOne([0.35, 0.2, 0.15, 0.1, 0.2]) && !L.sumsToOne([0.35, 0.2, 0.15, 0.1, 0.3])
    ? true
    : 'sumsToOne disagreed with arithmetic');

// Driven over a FIXTURE, not over the real policy file.
//
// The assertion that resolves `status.live` against package.json lives further
// down, inside `if (policy?.level === 'PRESENT')`. The real file does not parse,
// so that branch never executes — and the `lane-live-claims-read-as-evidence`
// mutation SURVIVED on the suite's first mutation run: the invariant was
// asserted over a situation no input reached. Vacuous, and invisible from a
// green run. This is cause 2 in the manifest's own list, found in the gate
// written to prevent it.
check('liveClaimsNeedingBacking surfaces every self-declared live entry', () => {
  const claims = L.liveClaimsNeedingBacking({
    live: ['pay_contracted_eval', 'refuses_to_issue'],
    soft_live: ['five_axis_pi'],
  });
  if (claims.length !== 2) return `returned ${claims.length} claims, expected 2`;
  if (claims.includes('five_axis_pi')) return 'pulled a soft-live entry into the live list';
  return claims.includes('pay_contracted_eval') && claims.includes('refuses_to_issue')
    ? true
    : `returned [${claims.join(', ')}]`;
});

check('an empty live list yields nothing to back, and that is not the same as none declared', () =>
  L.liveClaimsNeedingBacking({}).length === 0 &&
  L.liveClaimsNeedingBacking({ live: ['x'] }).length === 1
    ? true
    : 'liveClaimsNeedingBacking cannot distinguish "no claims" from "not read"');

// ── 2. Presence — looked at, not taken on report ────────────────────────────

const findings = [];
for (const art of L.MANDATORY) {
  if (!existsSync(art.path)) {
    findings.push({ ...art, level: 'ABSENT', detail: 'no file at this path' });
    continue;
  }
  const raw = readFileSync(art.path, 'utf8');
  if (raw.trim().length === 0) {
    findings.push({ ...art, level: 'MALFORMED', detail: 'file is empty' });
    continue;
  }
  if (art.format === 'yaml') {
    try {
      const doc = yaml.load(raw);
      findings.push({ ...art, level: 'PRESENT', detail: 'parsed', doc });
    } catch (e) {
      findings.push({ ...art, level: 'MALFORMED', detail: `YAML: ${e.message}` });
    }
  } else if (art.format === 'json' || art.format === 'json-schema') {
    try {
      const doc = JSON.parse(raw);
      findings.push({ ...art, level: 'PRESENT', detail: 'parsed', doc });
    } catch (e) {
      findings.push({ ...art, level: 'MALFORMED', detail: `JSON: ${e.message}` });
    }
  } else {
    findings.push({ ...art, level: 'PRESENT', detail: `${raw.length} bytes`, raw });
  }
}

check('MANDATORY names four artifacts across both lanes', () => {
  const lanes = new Set(L.MANDATORY.map((a) => a.lane));
  return L.MANDATORY.length === 4 && lanes.has('XC') && lanes.has('GA')
    ? true
    : `${L.MANDATORY.length} artifacts, lanes ${[...lanes].join(',')}`;
});

// ── 3. Content, for whatever is present ─────────────────────────────────────

const policy = findings.find((f) => f.path === 'docs/policy/authority-policy.v0.5.yaml');
const anfis = findings.find((f) => f.path === 'docs/policy/anfis-objective.md');

if (policy?.level === 'PRESENT') {
  const doc = policy.doc;

  check('policy: five-axis weights sum to 1', () => {
    const w = doc?.composite?.weights;
    if (!w) return 'composite.weights absent';
    return L.sumsToOne(Object.values(w))
      ? true
      : `weights sum to ${Object.values(w).reduce((a, b) => a + b, 0)}`;
  });

  check('policy: the five axes are exactly S,P,H,Q,E', () => {
    const axes = [...(doc?.composite?.axes ?? [])].sort().join('');
    return axes === 'EHPQS' ? true : `axes are [${doc?.composite?.axes}]`;
  });

  check('policy: every published referral worked value follows from the formula', () => {
    const wv = doc?.referral?.worked_values;
    if (!wv) return 'referral.worked_values absent';
    const rows = Object.entries(wv).map(([k, v]) => ({
      n: Number(String(k).replace(/^n_/, '')),
      raw: v.raw,
      delta: v.delta,
    }));
    const bad = L.referralDisagreements(rows);
    return bad.length === 0 ? true : bad.join('; ');
  });

  check('policy: the decidable referral mutants hold', () => {
    const bad = L.decidableMutants().filter((m) => !m.holds);
    return bad.length === 0 ? true : bad.map((m) => `${m.id} (${m.detail})`).join('; ');
  });

  check('policy: the settle magnitude follows from lambda_sigma', () => {
    const lam = doc?.decay?.lambda_sigma;
    if (typeof lam !== 'number') return 'decay.lambda_sigma absent or not a number';
    // The file states `(1 - λ_σ) · Δ_full = 0.5 · Δ_full`, which requires λ = 0.5.
    return Math.abs(1 - lam - 0.5) < 1e-9
      ? true
      : `lambda_sigma ${lam} makes the settle tick ${(1 - lam).toFixed(3)}·Δ_full, not 0.5`;
  });

  check('policy: no surface is in two status buckets', () => {
    const bad = L.bucketOverlaps(doc?.status ?? {});
    return bad.length === 0 ? true : bad.join('; ');
  });

  check('policy: nothing in `cannot_promote` is already claimed live or soft-live', () => {
    const barred = new Set(doc?.promote?.cannot_promote ?? []);
    const claimed = [...(doc?.status?.live ?? []), ...(doc?.status?.soft_live ?? [])];
    const bad = claimed.filter((c) => barred.has(c));
    return bad.length === 0
      ? true
      : `${bad.join(', ')} claimed as live/soft-live while listed under cannot_promote`;
  });
}

if (anfis?.level === 'PRESENT') {
  check('anfis: the local-cost priors sum to 1', () => {
    // `(α_c, α_ℓ, α_d, α_π) = (0.30,0.30,0.20,0.20)` — read from the document so
    // an edit to the numbers is caught rather than compared against a copy here.
    const m = anfis.raw.match(/\\alpha_\\pi\)\s*=\s*\(([^)]*)\)/);
    if (!m) return 'could not locate the alpha prior tuple in the document';
    const nums = m[1].split(',').map((s) => Number(s.trim()));
    if (nums.length !== 4 || nums.some(Number.isNaN)) return `parsed ${m[1]} as ${nums}`;
    return L.sumsToOne(nums) ? true : `alphas sum to ${nums.reduce((a, b) => a + b, 0)}`;
  });

  check('anfis: the routing weights match the policy file, not a second copy', () => {
    // The policy file is the other half of this comparison. If it did not parse
    // there is nothing to compare against, and that is NOT agreement.
    if (policy?.level !== 'PRESENT') return SKIP;
    const w = policy.doc?.composite?.weights ?? {};
    const declared = [w.S, w.P, w.H, w.Q, w.E].map((x) => x.toFixed(2)).join(',');
    // The doc restates the vector; two copies of a number is the defect this
    // repo has logged three times (the fourth tier ladder, the two rank rules).
    const inDoc = anfis.raw.includes('(0.35,\\ 0.20,\\ 0.15,\\ 0.10,\\ 0.20)');
    return inDoc && declared === '0.35,0.20,0.15,0.10,0.20'
      ? true
      : `policy says (${declared}); the routing doc's restatement did not match`;
  });

  check('anfis: the cold start is the linear cost, stated as such', () =>
    /ANFIS then \*\*is\*\* the linear cost/.test(anfis.raw) || /honest cold start/.test(anfis.raw)
      ? true
      : 'the document no longer says the cold start IS the linear model — that sentence is what stops a fitted-router claim with no fit');
}

// ── 3b. The GA contracts — graded against what they ACTUALLY are ───────────
//
// REWRITTEN 2026-08-19 after the real files landed on main (#105). The previous
// version of this block was written against a CC-authored stand-in and asserted
// that stand-in's SHAPE: `$defs` rather than `definitions`, a `lands_on_axis`
// const, iota ladders, a `schema_version`, an `evidence.level` enum. Nineteen of
// thirty-eight assertions went red against the real files, and almost none of
// that was the files being wrong.
//
// That is the useful half of what happened. The stand-in's own provenance block
// said GA's version should REPLACE it, not merge with it — and when it did, the
// gates written alongside it turned out to be grading the author's structure
// rather than the policy. Kept as a lesson: a gate written by the artifact's
// author encodes the author's choices as requirements unless something forces it
// not to.
//
// ── WHAT THE REAL CONTRACT IS ───────────────────────────────────────────────
//
// An EVENT ENVELOPE, not a restatement of the policy. Every reputation event
// carries `agent_id, event_type, delta, repid_before, repid_after,
// repid_delta_applied, idempotency_key, metadata`, and the numeric rules stay in
// `authority-policy.v0.5.yaml` where they belong. That is a cleaner split than
// the stand-in's, which duplicated the policy's constants into the schema — two
// copies of a number, the defect this repo has logged five times.
//
// So these assertions check the ENVELOPE's invariants and the two places the
// contract does commit to a value, and they stop demanding the policy's
// constants appear here at all.

const events = findings.find((f) => f.path === 'docs/contracts/events.v1.json');
const capdec = findings.find(
  (f) => f.path === 'docs/contracts/capability-declaration.schema.json'
);

/** draft-07 `definitions` or 2020-12 `$defs` — read whichever the file uses. */
const defsOf = (doc) => doc?.definitions ?? doc?.$defs ?? {};

if (events?.level === 'PRESENT') {
  const defs = defsOf(events.doc);
  const REPUTATION_EVENTS = ['DORMANCY_DECAY', 'ECOSYSTEM_REFERRAL', 'IMPACT_REWARD'];

  check('events: the five Phase-1 contracts are all present', () => {
    const want = [...REPUTATION_EVENTS, 'ZKPPassportDisclosure', 'X402GateDecision'];
    const missing = want.filter((k) => !defs[k]);
    return missing.length === 0 ? true : `missing: ${missing.join(', ')}`;
  });

  check('events: EVERY reputation event requires an idempotency_key', () => {
    // The envelope's strongest property, and the one that makes a replayed
    // decay run detectable. The contract requires it on all three; nothing may
    // quietly drop it.
    const without = REPUTATION_EVENTS.filter(
      (k) => !(defs[k]?.required ?? []).includes('idempotency_key')
    );
    return without.length === 0
      ? true
      : `${without.join(', ')} do not require idempotency_key — a doubled run would be undetectable`;
  });

  check('events: every reputation event carries the before/after pair', () => {
    // repid_before + repid_after + repid_delta_applied. Without all three you
    // cannot tell a clamped write from an unclamped one after the fact.
    const incomplete = REPUTATION_EVENTS.filter((k) => {
      const req = defs[k]?.required ?? [];
      return !['repid_before', 'repid_after', 'repid_delta_applied'].every((f) => req.includes(f));
    });
    return incomplete.length === 0 ? true : `${incomplete.join(', ')} cannot be audited after the fact`;
  });

  check('events: applied deltas are JSON integers, not number', () => {
    // Ledger law: docs/policy/integer-delta-rule.v1.md. type:number accepts 1.5.
    // Explicit exception: weeks_idle, effective_rate, I, delta_raw, USD fields,
    // axis_scores, A_eff — none of those are `delta` / `repid_delta_applied`.
    const bad = REPUTATION_EVENTS.filter((k) => {
      const d = defs[k]?.properties ?? {};
      return d.delta?.type !== 'integer' || d.repid_delta_applied?.type !== 'integer';
    });
    return bad.length === 0
      ? true
      : `${bad.join(', ')} accept non-integer applied deltas`;
  });

  check('events: DECAY can only ever be negative', () => {
    // `maximum: 0` on both delta and repid_delta_applied. A decay event that
    // could carry a positive delta is a reward wearing a decay label.
    const d = defs.DORMANCY_DECAY?.properties ?? {};
    return d.delta?.maximum === 0 && d.repid_delta_applied?.maximum === 0
      ? true
      : `delta.maximum=${d.delta?.maximum}, repid_delta_applied.maximum=${d.repid_delta_applied?.maximum} — decay must not be able to add RepID`;
  });

  check('events: each event_type is pinned to its own literal', () => {
    const wrong = REPUTATION_EVENTS.filter((k) => {
      const e = defs[k]?.properties?.event_type;
      const allowed = e?.enum ?? (e?.const ? [e.const] : []);
      return allowed.length !== 1 || allowed[0] !== k;
    });
    return wrong.length === 0
      ? true
      : `${wrong.join(', ')} do not pin event_type — one event could be recorded as another`;
  });

  check('events: the x402 gate names real_collateral_usd, not a generic stake', () => {
    // The field this repo measured as 51/52 simulated. Naming it "real" in the
    // contract is what stops an unfiltered SUM(amount) satisfying it.
    const req = defs.X402GateDecision?.required ?? [];
    return req.includes('real_collateral_usd') && req.includes('effective_authority')
      ? true
      : `X402GateDecision requires [${req.join(', ')}]`;
  });

  check('events: the x402 decision distinguishes NO STAKE from AUTHORITY EXCEEDED', () => {
    const e = defs.X402GateDecision?.properties?.decision?.enum ?? [];
    return e.includes('DENIED_NO_STAKE') && e.includes('DENIED_AUTHORITY_EXCEEDED')
      ? true
      : `decision enum [${e.join(', ')}] — a denial you cannot explain is not actionable`;
  });
}

if (capdec?.level === 'PRESENT') {
  const props = capdec.doc?.properties ?? {};
  const required = capdec.doc?.required ?? [];

  check('capability: the declaration is VERSIONED', () =>
    required.includes('adapter_version') || props.adapter_version
      ? true
      : 'no adapter_version — an unversioned contract silently changes meaning');

  check('capability: it declares what the router needs to route', () => {
    // cost, latency, degradation — the three the ANFIS local cost consumes.
    const want = ['cost_model', 'latency_class', 'degradation_class'];
    const missing = want.filter((k) => !required.includes(k));
    return missing.length === 0 ? true : `missing from required: ${missing.join(', ')}`;
  });

  check('capability: FAILURE MODES are declared, not discovered', () =>
    required.includes('failure_modes')
      ? true
      : 'failure_modes is not required — an adapter that declares only its happy path is the ' +
        'shape every unearned success claim in this repo has taken');
}

// ── 3c. A RECONSTRUCTION must say so; a real deliverable need not ──────────
//
// The stand-in carried `x-provenance` naming CC as author and GA as the lane
// that had not delivered, and this gate demanded it. The real files landed
// without one, correctly — they ARE the lane deliverable, and there is nothing
// to disclose. The assertion is now conditional: it fires only on a file that
// declares itself a reconstruction, which is the case it was written for.

for (const f of [events, capdec]) {
  if (f?.level !== 'PRESENT') continue;
  check(`${f.path.split('/').pop()}: any RECONSTRUCTION declares itself`, () => {
    const p = f.doc?.['x-provenance'];
    if (!p) return true; // a real lane deliverable has nothing to disclose
    if (p.status === 'RECONSTRUCTION' && !p.not_authored_by)
      return 'declared RECONSTRUCTION without naming the lane that did not author it';
    return true;
  });
}

// ── 4. The document's own `live` list is an ASSERTION ───────────────────────
//
// promotion.ts refuses an asserted stage. The policy file publishes one, so
// each entry is resolved against a check suite that exists in package.json.

const SUITE_FOR_CLAIM = {
  // Backed: `evaluateContractedPayment` is driven by the payment suites, and
  // `refusesToIssue` by the provenance suite that calls the real function.
  pay_contracted_eval: 'check:payment-fail-posture',
  refuses_to_issue: 'check:verdict-provenance',
};

let unbacked = [];
if (policy?.level === 'PRESENT') {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const claims = L.liveClaimsNeedingBacking(policy.doc?.status ?? {});
  unbacked = claims.filter((c) => {
    const suite = SUITE_FOR_CLAIM[c];
    return !suite || !pkg.scripts?.[suite];
  });

  check('policy: every `status.live` claim resolves to a suite that exists', () =>
    unbacked.length === 0
      ? true
      : `${unbacked.join(', ')} claimed live with no gate in package.json — ` +
        'an asserted stage, which is the thing promotion.ts refuses');
}

// ── 5. The promotion table, DERIVED ────────────────────────────────────────

const artifactId = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'working-tree';
  }
})();

/**
 * One claim per artifact. `ranAgainst` is this commit, so a run recorded against
 * anything else is discarded by `evidenceFor` rather than counted — the A18
 * field.
 */
const claims = findings.map((f) => {
  const runs = [];
  if (f.level === 'ABSENT') {
    // No run at all. stageFor returns null -> NOT CHECKED. Deliberately not a
    // FAILED run: we have not measured the content, we have measured its absence.
  } else if (f.level === 'MALFORMED') {
    runs.push({
      gate: 'check:lane-files',
      ranAgainst: artifactId,
      outcome: 'FAILED',
      coversWholeClaim: false,
      gatesTheBuild: true,
      detail: f.detail,
    });
  } else {
    const prefix = f.format === 'yaml' ? 'policy:' : 'anfis:';
    const relevant = failures.filter((x) => x.startsWith(prefix));
    const unrun = skipped.filter((x) => x.startsWith(prefix));
    runs.push({
      gate: 'check:lane-files',
      ranAgainst: artifactId,
      // A skipped check is NOT_CHECKED, which stageFor turns into `observe` —
      // never `soft-live`. A row cannot look measured because a dependency of
      // its measurement was missing.
      outcome: relevant.length > 0 ? 'FAILED' : unrun.length > 0 ? 'NOT_CHECKED' : 'VERIFIED',
      // Structural + arithmetic only. Nothing here executes the policy, so the
      // gate CANNOT cover the whole claim — that is soft-live by construction,
      // and saying so is the honest answer until a runtime consumes the file.
      coversWholeClaim: false,
      gatesTheBuild: true,
      detail:
        relevant.length > 0
          ? relevant.join('; ')
          : unrun.length > 0
            ? `${unrun.length} check(s) could not run: ${unrun.join('; ')}`
            : 'structural and arithmetic checks pass',
    });
  }
  return { surface: `${f.lane} · ${f.path}`, artifact: artifactId, runs };
});

const table = P.statusTable(claims);

// ── report ──────────────────────────────────────────────────────────────────

rmSync(outDir, { recursive: true, force: true });

console.log('');
console.log('Lane artifacts — stage DERIVED from measurement, never asserted');
console.log('');
for (const row of table) {
  const stage = row.stage === null ? 'NOT CHECKED' : row.stage.toUpperCase();
  console.log(`  ${stage.padEnd(11)} ${row.surface}`);
  console.log(`              ${row.reason}`);
}
console.log('');
const absent = findings.filter((f) => f.level === 'ABSENT');
if (absent.length > 0) {
  console.log(`  ${absent.length} of ${L.MANDATORY.length} mandatory artifacts DO NOT EXIST:`);
  for (const a of absent) console.log(`    ${a.lane}  ${a.path}  — ${a.purpose}`);
  console.log('');
}
if (unbacked.length > 0) {
  console.log(`  unbacked \`status.live\` claims: ${unbacked.join(', ')}`);
  console.log('');
}

if (skipped.length > 0) {
  console.log(`  ${skipped.length} check(s) could not run — reported, never counted as passes:`);
  for (const s of skipped) console.log(`    ${s}`);
  console.log('');
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length + skipped.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// Absence is NOT CHECKED, not a failure — exit 2, the repo's NOT_CHECKED code.
// Failing here would say GA's content is wrong; we have never seen it.
if (absent.length > 0) {
  console.log(
    `NOT CHECKED: ${pass} assertions pass over ${L.MANDATORY.length - absent.length} ` +
      `present artifact(s); ${absent.length} absent and therefore unmeasured`
  );
  process.exit(2);
}

console.log(`VERIFIED: ${pass} assertions over all ${L.MANDATORY.length} mandatory artifacts`);
