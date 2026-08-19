// scripts/exercise-promotion-attribution.mjs
//
// Exercises promotion.ts's canPromoteToLive() against a REAL claim with
// HONEST attribution, instead of only the synthetic fixtures in
// check-verifier-independence.mjs.
//
// check-verifier-independence.mjs already proved the seam itself is
// correct (16/16) and said plainly: "the seam works; it is not satisfied
// -- no gate in this repo records attribution yet." This script is that
// satisfaction, for exactly one real claim: the authority/collateral work
// from claude/v1-spine-authority-collateral, which this same session
// authored and ran.
//
// V1 spine item 2 (2026-08-19): "cross-LLM verifier seam in promotion:
// authoredBy/verifiedBy; Live requires disjoint verifier or explicit
// NOT_DISJOINT (no quiet self-grade)." The seam (verifier-independence.ts +
// promotion.ts's canPromoteToLive) already existed and was already tested
// against fixtures before this script was written -- this adds the real
// exercise, and it is deliberately NOT rigged to pass: the honest answer
// for this session's own work is that it is self-verified, and the point
// is to watch the gate say so rather than to make it say VERIFIED.
//
// Zero network, zero DB: promotion.ts and verifier-independence.ts are both
// zero-imports, so this is pure-function exercise against real, first-hand
// facts (this session's own git history and its own two check-script runs)
// rather than a live query. That is a different, narrower kind of "real"
// than exercise-collateral-live.mjs's live DB read -- named here so the two
// are not confused with each other.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.promotion-attribution-check-'));
let P;
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
      files: [join(process.cwd(), 'lib/trustshell/promotion.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  P = await import(pathToFileURL(join(outDir, 'lib/trustshell/promotion.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile promotion.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

// ── The REAL artifact and REAL run outcomes, not invented ──────────────────
//
// The SHA is this branch's own HEAD at the time this script runs -- the A18
// property applies to this script too: an artifact id supplied once and
// reused later would itself be evidence "for a different artifact" the
// moment a new commit lands.
const HEAD = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

// Both outcomes below are transcribed from actually running these two
// commands in this session, not asserted: `node
// scripts/check-authority-runtime.mjs` printed "VERIFIED: 26 assertions";
// `node scripts/exercise-collateral-live.mjs` printed "NOT_CHECKED: could
// not read stake_deposits live" (exit 2) because this sandbox's outbound
// proxy denies qnnpjhlxljtqyigedwkb.supabase.co -- see that script's own
// header. Re-run both yourself before trusting these two lines if this
// script is read outside of that session.
const claim = {
  surface: 'authority-policy + collateral: real caller on the live pay path',
  artifact: HEAD,
  runs: [
    {
      gate: 'check:authority-runtime',
      ranAgainst: HEAD,
      outcome: 'VERIFIED',
      coversWholeClaim: false, // fixture-based -- see next run for why
      gatesTheBuild: true,
      detail: '26/26 assertions against a hand-transcribed fixture of stake_deposits, and the real policy YAML',
      attribution: {
        authoredBy: { family: 'claude', model: 'claude-sonnet-5' },
        verifiedBy: { family: 'claude', model: 'claude-sonnet-5' },
      },
    },
    {
      gate: 'check:collateral-live',
      ranAgainst: HEAD,
      outcome: 'NOT_CHECKED',
      coversWholeClaim: false,
      gatesTheBuild: false, // exits 2, not 1 -- does not fail the build, see its own header
      detail: 'could not reach stake_deposits live from this sandbox; compiled and reached the expected network call',
      attribution: {
        authoredBy: { family: 'claude', model: 'claude-sonnet-5' },
        verifiedBy: { family: 'claude', model: 'claude-sonnet-5' },
      },
    },
  ],
};

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

check('the claim has a stage at all (a gate did run against this exact HEAD)', () => {
  const stage = P.stageFor(claim);
  return stage !== null ? true : 'stageFor returned null -- no evidence for this artifact';
});

check('the stage is NOT live or soft-live, honestly, because one gate is NOT_CHECKED', () => {
  const stage = P.stageFor(claim);
  // stageFor: any run still NOT_CHECKED -> 'observe', regardless of what else passed.
  return stage === 'observe'
    ? true
    : `stage came back "${stage}" -- a NOT_CHECKED run must not be outvoted by a passing one`;
});

check('canPromoteToLive REFUSES, and names the NOT_CHECKED run as a reason', () => {
  const { ok, blockers } = P.canPromoteToLive(claim);
  return ok === false && blockers.some((b) => /NOT_CHECKED/.test(b))
    ? true
    : `ok=${ok}, blockers=${JSON.stringify(blockers)}`;
});

check('canPromoteToLive ALSO names self-verification as a reason -- no quiet self-grade', () => {
  const { blockers } = P.canPromoteToLive(claim);
  return blockers.some((b) => /same training lineage|SAME training lineage/i.test(b))
    ? true
    : `blockers did not mention self-verification: ${JSON.stringify(blockers)} -- ` +
      'this session authored and ran both gates itself, and the seam must say so';
});

check('independentEvidenceFor is empty -- nothing here counts as a second opinion yet', () => {
  return P.independentEvidenceFor(claim).length === 0
    ? true
    : 'a run counted as independent, but every attribution above is claude/claude';
});

check('selfVerifiedEvidence names exactly the runs that are self-graded', () => {
  return P.selfVerifiedEvidence(claim).length === claim.runs.length
    ? true
    : `expected all ${claim.runs.length} runs to be self-verified, got ${P.selfVerifiedEvidence(claim).length}`;
});

// ── What WOULD change the verdict, stated rather than simulated ────────────
//
// Not asserted as a passing check -- there is no data to back a "yes" here.
// Printed so the next reader knows exactly what closes the gap, the same
// way CollateralRepository.forAgent() names its blocker instead of hiding it.
const disjointExample = {
  ...claim,
  runs: claim.runs.map((r) => ({
    ...r,
    attribution: { authoredBy: r.attribution.authoredBy, verifiedBy: { family: 'gpt', model: 'unspecified' } },
  })),
};
const disjointStage = P.canPromoteToLive(disjointExample);

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions -- the promotion seam was exercised against a REAL claim`);
console.log(
  `  Honest verdict for ${claim.surface} @ ${HEAD.slice(0, 12)}: stage=${P.stageFor(claim)}, ` +
    'not promotable -- self-verified, and one gate NOT_CHECKED.'
);
console.log(
  '  For contrast (NOT run for real, illustrative only): if verifiedBy were a disjoint family, ' +
    `canPromoteToLive would still block on ${disjointStage.blockers.length} other reason(s): ` +
    `${JSON.stringify(disjointStage.blockers)}`
);
