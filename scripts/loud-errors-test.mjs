#!/usr/bin/env node
// scripts/loud-errors-test.mjs
//
// THE SILENT-EMPTY GUARD.
//
// Four reads destructured only `data` and dropped `error`. Every one of them
// turned a permissions or transport failure into a PLAUSIBLE WRONG ANSWER —
// not an exception, not an empty state a caller could recognise, but a
// confident value indistinguishable from a real one:
//
//   KYAValidator.getDailySpend          -> 0 spent today   (authorizes payment)
//   EarnedMetricsRepo.resolveAgent      -> no such agent   (agent has no history)
//   RepIDCalculator.getInstitutionWeights -> OUR defaults  (their risk posture, silently)
//   auth.listInstitutions (service)     -> []              (you have no access)
//
// In three of the four, THE CORRECT PATTERN WAS ALREADY IN THE SAME FILE —
// `EarnedMetricsRepo.load` captures `error` twelve lines below `resolveAgent`
// and even explains why ("a failed read is not an absence of evidence");
// `KYAValidator.getAgentProfile` captures it directly above `getDailySpend`;
// `auth.listInstitutions` captures it in the very next branch of the same
// function. These were oversights, not decisions, and a suite is the only
// thing that keeps them from coming back.
//
// This suite drives each failure path with an injected client and asserts the
// LOUD behaviour. Each case also asserts the happy path still works, because a
// fix that throws on everything is not a fix.
//
// `lib/api-fetch.ts` is deliberately NOT here — see its own comment. It drops
// `error` too, but a missing session produces a 401 that `apiFetch` already
// raises as `ApiError.isUnauthenticated`, so the failure is loud one layer
// down. Throwing there would take the app down for an ordinary signed-out user.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

let passed = 0;
const failures = [];

function eq(actual, expected, label) {
  if (actual === expected) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(v, label) {
  if (v) passed += 1;
  else failures.push(`${label} — expected truthy, got ${JSON.stringify(v)}`);
}
async function check(label, fn) {
  try { await fn(); } catch (e) { failures.push(`${label} threw: ${e.message}`); }
}
/** Assert `fn` rejects, and that the message names the cause rather than hiding it. */
async function refuses(fn, mustMention, label) {
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  if (!threw) { failures.push(`${label} — expected a refusal, got none`); return; }
  if (!threw.message.includes(mustMention)) {
    failures.push(`${label} — refused, but never mentions "${mustMention}": ${threw.message}`);
    return;
  }
  passed += 1;
}

// ---------------------------------------------------------------------------
// Compile. These modules import '@/lib/supabase-admin', and tsc does NOT
// rewrite path aliases at emit, so the emitted require would not resolve.
// Rewrite it to a stub that THROWS: if injection ever silently fails to take
// effect, the fallback fires and this suite goes red rather than quietly
// talking to a real accessor.
// ---------------------------------------------------------------------------

const outDir = mkdtempSync(join(process.cwd(), '.loud-errors-check-'));
let Earned, KYA, RepID, tsconfigPath;
try {
  // A tsconfig rather than CLI flags, because `paths` has no CLI equivalent and
  // the alias must resolve at COMPILE time as well as at runtime. Without it
  // `this.supabase` types as `any`, which silently drops the strictness this
  // suite is meant to run under — the errors would look like unrelated
  // implicit-any noise rather than a missing module.
  tsconfigPath = join(process.cwd(), '.loud-errors-tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['./*'] },
          outDir,
          // Pinned — see work-contract-test.mjs. Same hazard as every sibling suite.
          rootDir: 'lib',
          module: 'commonjs',
          target: 'es2022',
          lib: ['es2022', 'dom'],
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
        files: [
          'lib/trustshell/EarnedMetricsRepo.ts',
          'lib/trustshell/KYAValidator.ts',
          'lib/trustshell/RepIDConfig.ts',
        ],
      },
      null,
      2
    )
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });

  const stub = join(outDir, 'supabase-admin-stub.js');
  writeFileSync(
    stub,
    'exports.getSupabaseAdmin = () => {\n' +
      "  throw new Error('the real accessor was reached — the injected client did not take effect');\n" +
      '};\n'
  );

  // Rewrite the alias in every emitted file.
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  for (const file of walk(outDir)) {
    if (!file.endsWith('.js')) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.includes('@/lib/supabase-admin')) continue;
    writeFileSync(file, src.split('"@/lib/supabase-admin"').join(JSON.stringify(stub)));
  }

  const base = join(outDir, 'trustshell');
  Earned = await import(pathToFileURL(join(base, 'EarnedMetricsRepo.js')).href);
  KYA = await import(pathToFileURL(join(base, 'KYAValidator.js')).href);
  RepID = await import(pathToFileURL(join(base, 'RepIDConfig.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  if (tsconfigPath) rmSync(tsconfigPath, { force: true });
  console.error('loud-errors compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

/**
 * A fake PostgREST builder. Thenable, because `getDailySpend` awaits the
 * builder directly rather than calling `.single()`.
 */
function fakeClient(result) {
  const b = {
    select: () => b, eq: () => b, gte: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve) => resolve(result),
  };
  return { from: () => b };
}

const RLS_DENIED = { message: 'permission denied for table', code: '42501' };

// ---------------------------------------------------------------------------
// 1. KYAValidator.getDailySpend — the one with teeth. It gates payments.
// ---------------------------------------------------------------------------

// RECONCILED IN THE #52 MERGE — two lanes, one defect, two different fixes.
//
// This suite asserted that `getDailySpend` THROWS. The zkrepid branch had
// independently made it return `number | null` and threaded that through
// `checkDailyLimit`, `validate()` and the receipt's `withinDailyLimit`, which
// is `boolean | null` so a receipt can carry "this limit was NOT evaluated" as
// a fact about the decision. The merge kept the nullable return, for reasons
// recorded on the method: a throw leaves no artifact saying which check did not
// run, and a throwing gate tends to acquire a `try/catch` returning the
// permissive answer, which is how this class of bug returns.
//
// THE INTENT OF THIS TEST IS UNCHANGED and is what matters: a permissions
// failure must never read as "spent nothing today". Only the shape of the
// refusal moved, from an exception to a value the compiler forces every caller
// to handle.
await check('getDailySpend REFUSES an unreadable ledger instead of reporting 0', async () => {
  const v = new KYA.KYAValidator(fakeClient({ data: null, error: RLS_DENIED }));
  const spend = await v.getDailySpend('TORCH');
  eq(spend, null, 'an RLS denial must not read as "spent nothing today"');
  // The distinction that had teeth: null and 0 are different answers, and the
  // old code could only give the second one.
  truthy(spend !== 0, 'and must be distinguishable from a genuinely quiet day');
});

await check('getDailySpend REFUSES a row whose amount will not parse', async () => {
  // The hole capturing the query error does not close. `reduce` folds one bad
  // row to NaN, and `NaN > limit` is false — so the unparseable row PASSES the
  // limit it broke. An unknown total is not a smaller one.
  const v = new KYA.KYAValidator(
    fakeClient({ data: [{ payment_amount_usdc: 10 }, { payment_amount_usdc: 'not-a-number' }], error: null })
  );
  eq(await v.getDailySpend('TORCH'), null, 'one unreadable amount makes the TOTAL unknown');
  truthy(!Number.isFinite(10 + Number('not-a-number')), 'precondition: reduce would have folded it to NaN');
  truthy(!(NaN > 1000), 'precondition: and NaN clears every limit rather than failing it');
});

await check('getDailySpend still sums a real result', async () => {
  const v = new KYA.KYAValidator(
    fakeClient({ data: [{ payment_amount_usdc: 10 }, { payment_amount_usdc: 2.5 }], error: null })
  );
  eq(await v.getDailySpend('TORCH'), 12.5, 'the happy path must be unchanged');
});

await check('getDailySpend returns 0 for a genuinely empty ledger', async () => {
  const v = new KYA.KYAValidator(fakeClient({ data: [], error: null }));
  // 0 is the RIGHT answer here. The defect was never "returns 0" — it was
  // returning 0 when it could not tell.
  eq(await v.getDailySpend('TORCH'), 0, 'no receipts really is zero spend');
});

// ---------------------------------------------------------------------------
// 2. EarnedMetricsRepo.resolveAgent — three outcomes, not two.
// ---------------------------------------------------------------------------

await check('resolveAgent reports UNREADABLE rather than absent', async () => {
  const repo = new Earned.EarnedMetricsRepository(fakeClient({ data: null, error: RLS_DENIED }));
  const r = await repo.resolveAgent('TORCH');
  eq(r.status, 'unreadable', 'a failed read is not an absent agent');
  truthy(r.detail.includes('permission denied'), "and it carries the database's own message");
});

await check('resolveAgent still reports ABSENT for a real miss', async () => {
  const repo = new Earned.EarnedMetricsRepository(fakeClient({ data: null, error: null }));
  eq((await repo.resolveAgent('nobody')).status, 'absent', 'no row really is no agent');
});

await check('resolveAgent still FINDS a real agent', async () => {
  const repo = new Earned.EarnedMetricsRepository(
    fakeClient({ data: { id: 'a1', agent_name: 'trinity-torch' }, error: null })
  );
  const r = await repo.resolveAgent('TORCH');
  eq(r.status, 'found', 'the happy path must be unchanged');
  eq(r.id, 'a1', 'and carry the id');
});

await check('load() reports an unreadable registry as unmeasured, NOT as "no track record"', async () => {
  const repo = new Earned.EarnedMetricsRepository(fakeClient({ data: null, error: RLS_DENIED }));
  const out = await repo.load('TORCH', { now: '2026-08-16T00:00:00.000Z' });
  eq(out.resolvedAgent, null, 'nothing resolved');
  // The distinction that matters: the reason must name the failure, not the agent.
  const reason = JSON.stringify(out.metrics);
  truthy(reason.includes('permission denied'), 'the RLS message must survive into the metrics');
  truthy(
    !reason.includes('no agent in repid_agents matches'),
    'and it must NOT be reported as an unregistered agent'
  );
});

// ---------------------------------------------------------------------------
// 3. RepIDCalculator.getInstitutionWeights — absent row vs unreadable row.
// ---------------------------------------------------------------------------

await check('getInstitutionWeights REFUSES an unreadable config', async () => {
  const calc = new RepID.RepIDCalculator(fakeClient({ data: null, error: RLS_DENIED }));
  await refuses(
    () => calc.getInstitutionWeights('acme'),
    'could not read institution_risk_config',
    'an RLS denial must not silently install our default risk weights'
  );
});

await check('getInstitutionWeights STILL defaults when the row is simply absent', async () => {
  // PGRST116 is what .single() reports for zero rows. Defaulting is correct
  // here, and this assertion is why the fix could not be a blanket `if (error)`.
  const calc = new RepID.RepIDCalculator(
    fakeClient({ data: null, error: { message: 'no rows', code: 'PGRST116' } })
  );
  const w = await calc.getInstitutionWeights('unconfigured');
  eq(w.bftAccuracy, 0.4, 'an institution with no config gets the defaults');
});

await check('getInstitutionWeights still returns configured weights', async () => {
  const custom = { bftAccuracy: 0.1, veritasCatchRate: 0.2, x402SuccessRate: 0.3, latencyOpportunity: 0.2, humanCustodyScore: 0.2 };
  const calc = new RepID.RepIDCalculator(fakeClient({ data: { repid_weights: custom }, error: null }));
  eq((await calc.getInstitutionWeights('acme')).bftAccuracy, 0.1, 'the happy path must be unchanged');
});

// ---------------------------------------------------------------------------
// 4. auth.listInstitutions — STATIC ONLY, and worth saying so.
// ---------------------------------------------------------------------------

// `listInstitutions` is a module function that calls `getSupabaseAdmin()`
// inline, so it cannot be driven with an injected client without reshaping the
// module. This is therefore a SOURCE assertion, which is weaker than the three
// behavioural cases above: it proves the error is captured and raised, not that
// the raise produces the right status at runtime. Recorded as a known limit
// rather than presented as equivalent coverage.
await check('listInstitutions captures error in BOTH branches [static]', async () => {
  const src = readFileSync('lib/auth.ts', 'utf8');
  const fn = src.slice(src.indexOf('export async function listInstitutions'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 1);

  eq(
    (body.match(/const \{ data \} = await/g) || []).length,
    0,
    'neither branch may destructure only `data`'
  );
  eq(
    (body.match(/const \{ data, error \}/g) || []).length,
    2,
    'both branches must capture `error`'
  );
  eq(
    (body.match(/throw new AuthError\(503/g) || []).length,
    2,
    'and both must raise 503 rather than return an empty list'
  );
});

rmSync(outDir, { recursive: true, force: true });
if (tsconfigPath) rmSync(tsconfigPath, { force: true });

console.log(`\nloud-errors: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All loud-errors checks passed.');
