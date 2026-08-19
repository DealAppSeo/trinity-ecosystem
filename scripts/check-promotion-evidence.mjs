// scripts/check-promotion-evidence.mjs
//
// DoD 7: "measurement harness capable of A18-style evidence before any
// soft-live -> live promotion." This gates the harness itself.
//
// A18 was three commits with `npm run check` never having run against them,
// behind a green tick that belonged to Vercel's preview-comments check. Nobody
// asserted anything false. The evidence was simply about something else, and
// nothing surfaced the absence.
//
// A promotion table has that failure available to it in one line. So the module
// under test refuses to accept a stage — it DERIVES one, and the derivation
// discards runs whose `ranAgainst` is not the artifact being promoted.
//
// The assertions below are ordered by how the mistake actually happens:
// stale-but-green first, missing-gate second, partial-coverage third.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.promotion-check-'));
let P;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/promotion.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'inherit' }
  );
  P = await import(pathToFileURL(join(outDir, 'trustshell', 'promotion.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  throw e;
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
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

const run = (o) => ({
  gate: 'check:example',
  ranAgainst: 'sha-abc',
  outcome: 'VERIFIED',
  coversWholeClaim: true,
  gatesTheBuild: true,
  detail: '',
  // Attributed to two DIFFERENT training lineages by default, so "every
  // condition holds" means every condition — independence included. Added
  // 2026-08-19 when promotion started requiring a verifier disjoint from the
  // author; the assertion below pins the other direction.
  attribution: {
    authoredBy: { family: 'claude', model: 'opus', provider: 'anthropic' },
    verifiedBy: { family: 'llama', model: 'llama-3.1-8b-instant', provider: 'groq' },
  },
  ...o,
});
const claim = (o) => ({ surface: 's', artifact: 'sha-abc', runs: [], ...o });

// ── A18 itself ──────────────────────────────────────────────────────────────

check('A18: a GREEN run against a DIFFERENT artifact is not evidence', () => {
  // The exact shape: real gate, real pass, wrong subject.
  const c = claim({ runs: [run({ ranAgainst: 'sha-OTHER' })] });
  eq(P.stageFor(c), null, 'must not earn a stage');
  eq(P.evidenceFor(c).length, 0, 'and must not count as evidence');
  eq(P.staleEvidence(c).length, 1, 'but must be REPORTED, not silently dropped');
  const r = P.report(c);
  eq(r.outcome, 'NOT_CHECKED', 'the outcome is NOT CHECKED');
  truthy(/another artifact/.test(r.reason), `the reason must name the mismatch: ${r.reason}`);
  truthy(r.staleGates.length === 1, 'and the stale gate is surfaced for a human to check');
});

check('a surface with NO gate gets no stage — absence is not a posture', () => {
  const c = claim({ runs: [] });
  eq(P.stageFor(c), null, 'null, not "observe"');
  eq(P.report(c).outcome, 'NOT_CHECKED', 'renders as NOT CHECKED');
  // Returning `observe` here would put an unmeasured surface in the table
  // looking like a deliberate choice, which is the table-shaped A18.
  truthy(/no gate ran/.test(P.report(c).reason), 'and says why');
});

check('an empty gate name is not a gate', () => {
  const c = claim({ runs: [run({ gate: '' })] });
  eq(P.stageFor(c), null, 'a blank gate must not count');
});

// ── the stages are derived, and each is reachable ───────────────────────────

check('live requires: ran, passed, gates the build, covers the whole claim', () => {
  eq(P.stageFor(claim({ runs: [run()] })), 'live', 'all four hold');
});

check('soft-live is VERIFIED but partial — not a weaker pass', () => {
  const c = claim({ runs: [run({ coversWholeClaim: false })] });
  eq(P.stageFor(c), 'soft-live', 'gated and passing, coverage partial');
  eq(P.report(c).outcome, 'VERIFIED', 'the outcome is still VERIFIED');
  // e.g. check:zk-cost proves the hash counts are optimal and nothing about
  // Poseidon2, because no scheme executes.
  truthy(/does not cover the whole claim/.test(P.report(c).reason), 'and says what is missing');
});

check('observe = it ran but cannot fail the build', () => {
  eq(P.stageFor(claim({ runs: [run({ gatesTheBuild: false })] })), 'observe', 'reports, does not gate');
  // A gate that ran but could not complete is also observe, never live.
  eq(P.stageFor(claim({ runs: [run({ outcome: 'NOT_CHECKED' })] })), 'observe', 'incomplete run');
});

check('blocked wins over everything else present', () => {
  const c = claim({ runs: [run(), run({ gate: 'check:other', outcome: 'FAILED', detail: 'boom' })] });
  eq(P.stageFor(c), 'blocked', 'a failure anywhere blocks');
  eq(P.report(c).reason, 'boom', 'and the failure detail is what is shown');
});

// ── promotion is where the mistake gets made ────────────────────────────────

check('canPromoteToLive REFUSES an observe-only surface and says why', () => {
  const r = P.canPromoteToLive(claim({ runs: [run({ gatesTheBuild: false })] }));
  eq(r.ok, false, 'must refuse');
  truthy(
    r.blockers.some((b) => /observation is not enforcement/.test(b)),
    `blockers must name it: ${r.blockers.join(' | ')}`
  );
});

check('canPromoteToLive names the A18 shape explicitly when it sees it', () => {
  const r = P.canPromoteToLive(claim({ runs: [run(), run({ gate: 'check:x', ranAgainst: 'sha-OLD' })] }));
  eq(r.ok, false, 'stale evidence must block promotion even when a good run exists');
  truthy(r.blockers.some((b) => /A18/.test(b)), 'and must name A18 so the reader knows the shape');
});

check('canPromoteToLive passes only when every condition holds', () => {
  const r = P.canPromoteToLive(claim({ runs: [run()] }));
  eq(r.ok, true, `should promote: ${r.blockers.join(' | ')}`);
  eq(r.blockers.length, 0, 'no blockers');
});

// ── the grader must not be the author ──────────────────────────────────────
//
// Added 2026-08-19, after the implementation lane authored GA's contract files
// and then ran the harness that graded them. Content gates fixed the empty-gate
// half; this fixes the half that survived it.

check('an UNATTRIBUTED run cannot promote, however green it is', () => {
  // This is the default state of every gate in this repo — none records who
  // checked what. "Nobody recorded it" must not read as "someone independent did".
  const bare = run();
  delete bare.attribution;
  const r = P.canPromoteToLive(claim({ runs: [bare] }));
  eq(r.ok, false, 'a fully green, fully gating, whole-claim run still must not promote');
  truthy(
    r.blockers.some((b) => /unattributed evidence is not independent/.test(b)),
    `blockers must name it: ${r.blockers.join(' | ')}`
  );
});

check('a SELF-VERIFIED run cannot promote, and is named as such', () => {
  const r = P.canPromoteToLive(
    claim({
      runs: [
        run({
          attribution: {
            authoredBy: { family: 'claude', model: 'opus' },
            verifiedBy: { family: 'claude', model: 'sonnet' },
          },
        }),
      ],
    })
  );
  eq(r.ok, false, 'same lineage on both sides must not promote');
  truthy(
    r.blockers.some((b) => /one opinion stated twice/.test(b)),
    `blockers must name it: ${r.blockers.join(' | ')}`
  );
});

check('independence is decided by LINEAGE, not by vendor', () => {
  // Two families behind one provider is what cross-llm-verifier.ts already does
  // on purpose: provider redundancy reduced, training-data diversity preserved.
  const r = P.canPromoteToLive(
    claim({
      runs: [
        run({
          attribution: {
            authoredBy: { family: 'llama', provider: 'groq' },
            verifiedBy: { family: 'gpt', provider: 'groq' },
          },
        }),
      ],
    })
  );
  eq(r.ok, true, `a shared vendor must not block disjoint lineages: ${r.blockers.join(' | ')}`);
});

check('independentEvidenceFor and selfVerifiedEvidence partition the attributed runs', () => {
  const c = claim({
    runs: [
      run(),                                                                  // disjoint
      run({ attribution: { authoredBy: { family: 'gpt' }, verifiedBy: { family: 'gpt' } } }),
      (() => { const b = run(); delete b.attribution; return b; })(),         // unattributed
    ],
  });
  eq(P.independentEvidenceFor(c).length, 1, 'exactly one disjoint run');
  eq(P.selfVerifiedEvidence(c).length, 1, 'exactly one self-verified run');
});

// ── the table ───────────────────────────────────────────────────────────────

check('statusTable orders WORST FIRST — the rows needing work read first', () => {
  const rows = P.statusTable([
    claim({ surface: 'a-live', runs: [run()] }),
    claim({ surface: 'b-none', runs: [] }),
    claim({ surface: 'c-blocked', runs: [run({ outcome: 'FAILED', detail: 'x' })] }),
    claim({ surface: 'd-soft', runs: [run({ coversWholeClaim: false })] }),
    claim({ surface: 'e-observe', runs: [run({ gatesTheBuild: false })] }),
  ]);
  eq(
    rows.map((r) => r.surface).join(','),
    'c-blocked,b-none,e-observe,d-soft,a-live',
    'blocked, then NOT CHECKED, then observe, soft-live, live'
  );
  // A table sorted best-first buries the unmeasured rows under the green ones,
  // which is how a status report becomes an advert.
  eq(rows[1].stage, null, 'the NOT CHECKED row is near the top, not omitted');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\npromotion-evidence: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — a promotion rule changed.\n');
  process.exit(1);
}
console.log(
  'check:promotion-evidence — VERIFIED. A stage cannot be asserted, only earned,\n' +
    '  and a run against another artifact is reported rather than counted.\n' +
    '\n  NOT CHECKED: no real surface is wired into this yet. It proves the RULE,\n' +
    '  not that any particular claim in the DoD table has been measured.\n'
);
