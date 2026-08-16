#!/usr/bin/env node
// scripts/check-review-session.mjs — the review surface, driven with real keys.
//
// Run: npm run check:review-session
//
// This drives `runReviewSession` — the exact function the route calls — with
// real Ed25519 keys derived from seeds, a real draw, a real contract, a real
// signed verdict and a real envelope. Nothing is stubbed except the judge
// tiers, which are injected precisely so this can run without a provider.
//
// WHY THAT MATTERS HERE. `runAcceptedWork` was correct, exported and exercised
// by its own suite before this, and the repo has already paid once for treating
// that as "wired". A route is the first place the composition meets
// configuration, key material and a request shape, and every one of those is a
// place a correct module gets connected to the wrong thing.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.review-session-check-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let session, did;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/review/session.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell');
  session = await import(pathToFileURL(join(base, 'review', 'session.js')).href);
  did = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
} catch (err) {
  console.error(
    `check:review-session — FAILED. module does not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const { runReviewSession, reviewConfigFrom, MIN_AUDITOR_POOL } = session;

let passed = 0;
const failures = [];
const eq = (a, b, label) => {
  if (a === b) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, label) => {
  if (v) passed += 1;
  else failures.push(`${label} — expected truthy, got ${JSON.stringify(v)}`);
};
async function refuses(fn, mustMention, label) {
  try {
    await fn();
    failures.push(`${label} — expected a refusal, got none`);
  } catch (e) {
    if (e.message.includes(mustMention)) passed += 1;
    else failures.push(`${label} — refused without naming "${mustMention}": ${e.message}`);
  }
}

// ── configuration refusals ──────────────────────────────────────────────────
//
// Every one of these would otherwise be a surface that mints an identity or
// draws from a pool of one, and both produce perfectly well-formed signatures.

await refuses(
  () => reviewConfigFrom({}),
  'TRUSTSHELL_DOER_SEED',
  'a missing doer seed refuses and names the variable'
);
await refuses(
  () => reviewConfigFrom({ TRUSTSHELL_DOER_SEED: '   ' }),
  'TRUSTSHELL_DOER_SEED',
  'a whitespace doer seed refuses — `|| ""` is the same bug'
);
await refuses(
  () => reviewConfigFrom({ TRUSTSHELL_DOER_SEED: 'x' }),
  'TRUSTSHELL_AUDITOR_SEEDS',
  'no auditor seeds refuses'
);
await refuses(
  () => reviewConfigFrom({ TRUSTSHELL_DOER_SEED: 'x', TRUSTSHELL_AUDITOR_SEEDS: 'only-one' }),
  'lottery',
  'a single-auditor pool refuses — a draw from one candidate names the auditor exactly'
);
await refuses(
  () =>
    reviewConfigFrom({
      TRUSTSHELL_DOER_SEED: 'x',
      TRUSTSHELL_AUDITOR_SEEDS: 'a,b',
      TRUSTSHELL_MIN_AUDITOR_TIER: 'high',
    }),
  'TRUSTSHELL_MIN_AUDITOR_TIER',
  'a non-numeric tier floor refuses rather than silently becoming NaN'
);

eq(MIN_AUDITOR_POOL, 2, 'the minimum meaningful pool is 2');

{
  const cfg = reviewConfigFrom({
    TRUSTSHELL_DOER_SEED: 'seed-doer',
    TRUSTSHELL_AUDITOR_SEEDS: ' a , b ,, c ',
    TRUSTSHELL_AUDITOR_BADGES: 'code-review, security',
  });
  eq(cfg.auditorSeeds.length, 3, 'seed lists are trimmed and empties dropped');
  eq(cfg.minTier, 3, 'the tier floor defaults');
  eq(cfg.requiredBadges.length, 2, 'badges are parsed');
}

// ── a real review, end to end ───────────────────────────────────────────────

// Seeds are SYNTHETIC and DERIVED here, never hardcoded — no production key
// material as a fixture (preflight). Each is a deterministic 32-byte pattern
// bs58-encoded, so the suite is reproducible without carrying a real key.
const bs58 = (await import('bs58')).default;
const seedFor = (tag) => {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = (tag.charCodeAt(i % tag.length) + i * 7) & 0xff;
  return bs58.encode(bytes);
};
const seeds = {
  doer: seedFor('check-doer'),
  auditors: ['check-auditor-1', 'check-auditor-2', 'check-auditor-3'].map(seedFor),
};

const config = {
  doerSeed: seeds.doer,
  auditorSeeds: seeds.auditors,
  minTier: 3,
  requiredBadges: ['code-review'],
};

const bank = Array.from({ length: 8 }, (_, i) => ({
  id: `b${i}`, statement: `bank criterion ${i}`, minScore: 0.9,
}));

/** A reviewer that signs off only from the Nth attempt onwards. */
const reviewerFrom = (acceptFrom, state) => [
  {
    name: 'reviewer',
    judge: {
      async judge() {
        return state.attempt >= acceptFrom
          ? { outcome: 'VERIFIED', score: 0.95, detail: 'to spec' }
          : { outcome: 'FAILED', detail: 'not to spec' };
      },
    },
  },
];

const baseRequest = (attempts, taskId) => ({
  taskId,
  deliverableSpec: 'a working thing',
  attempts,
  beacon: 'drand:round:31337',
  nonce: 'review-check',
  proposedAt: '2026-08-16T00:00:00.000Z',
});

const run = (request, tiers, policy) =>
  runReviewSession({
    request,
    config: policy ? { ...config, policy } : config,
    tiers,
    bank,
    criteriaCount: 2,
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });

// 1. One attempt, accepted immediately.
{
  const state = { attempt: 1 };
  const out = await run(
    baseRequest([{ deliverable: 'good work', digest: 'sha256:a' }], 'review-accept'),
    reviewerFrom(1, state)
  );
  eq(out.status, 'ACCEPTED', 'work the auditor signs off is ACCEPTED');
  truthy(out.envelope, 'an accepted review returns a portable envelope');
  truthy(out.auditorDid, 'and names the auditor that signed it');
  eq(out.awaitingRevision, false, 'an accepted review is not awaiting anything');
}

// 2. THE STATELESS CASE. One attempt, rejected: the loop runs out of
//    submissions and stops NON-TERMINAL rather than fabricating a round.
{
  const state = { attempt: 1 };
  const out = await run(
    baseRequest([{ deliverable: 'first try', digest: 'sha256:a' }], 'review-revise'),
    reviewerFrom(99, state)
  );
  eq(out.status, 'REVISE', 'a rejected first attempt asks for a revision');
  eq(out.awaitingRevision, true, 'and says the ball is with the doer');
  eq(out.rounds.length, 1, 'exactly one round ran — no attempt was invented');
  eq(out.envelope, undefined, 'nothing is delivered');
}

// 3. The revision arrives in a LATER request carrying the full history.
{
  const state = { attempt: 0 };
  const tiers = [
    {
      name: 'reviewer',
      judge: {
        async judge() {
          state.attempt += 1;
          // Rejects the criteria of round 1, accepts from round 2. The judge is
          // called per criterion, so this counts criteria, not rounds — which is
          // exactly why the acceptance decision is not left to a call counter.
          return state.attempt > 2
            ? { outcome: 'VERIFIED', score: 0.95, detail: 'to spec' }
            : { outcome: 'FAILED', detail: 'not to spec' };
        },
      },
    },
  ];
  const out = await run(
    baseRequest(
      [
        { deliverable: 'first try', digest: 'sha256:a' },
        { deliverable: 'revised', digest: 'sha256:b' },
      ],
      'review-revise'
    ),
    tiers
  );
  eq(out.status, 'ACCEPTED', 'the resubmitted history reaches acceptance');
  eq(out.rounds.length, 2, 'both attempts were judged');
  eq(out.rounds[0].verdict, 'REJECTED', 'the first attempt stays rejected on replay');

  // THE INVARIANT. Same beacon, same pool, same commitment — one auditor.
  eq(new Set(out.rounds.map((r) => r.auditorDid)).size, 1,
    'the auditor is identical across the replayed history');
}

// 4. A moving beacon re-draws, and that must be refused rather than accepted
//    as a second opinion. Asserted against the real draw, not a fixture.
{
  const state = { attempt: 1 };
  const first = await run(
    baseRequest([{ deliverable: 'x', digest: 'sha256:a' }], 'review-beacon'),
    reviewerFrom(1, state)
  );
  const moved = await runReviewSession({
    request: {
      ...baseRequest([{ deliverable: 'x', digest: 'sha256:a' }], 'review-beacon'),
      beacon: 'drand:round:99999',
    },
    config,
    tiers: reviewerFrom(1, state),
    bank,
    criteriaCount: 2,
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });
  truthy(
    first.auditorDid !== moved.auditorDid,
    'a different beacon draws a different auditor — which is WHY the beacon must be ' +
      'held constant across a review, and why runAcceptedWork checks it every round'
  );
}

// 5. The doer is never in the pool it is judged by.
{
  const state = { attempt: 1 };
  const out = await run(
    baseRequest([{ deliverable: 'x', digest: 'sha256:a' }], 'review-not-doer'),
    reviewerFrom(1, state)
  );
  const doer = await did.keyPairFromSeed(seeds.doer);
  truthy(out.auditorDid !== doer.did, 'the drawn auditor is never the doer');
}

// 6. An empty submission is a caller error, not an empty review.
await refuses(
  () => run(baseRequest([], 'review-empty'), reviewerFrom(1, { attempt: 1 })),
  'at least one submission',
  'a review with no attempts refuses'
);

if (failures.length > 0) {
  console.error(`\ncheck:review-session — FAILED. ${failures.length} of ${passed + failures.length}:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`check:review-session — VERIFIED. ${passed} assertions.`);
