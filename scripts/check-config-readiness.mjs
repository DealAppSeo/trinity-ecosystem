#!/usr/bin/env node
// scripts/check-config-readiness.mjs — the public config-presence report.
//
// Run: node scripts/check-config-readiness.mjs
//
// This rides on a PUBLIC, UNAUTHENTICATED endpoint, so the assertions that
// matter most are the ones proving it CANNOT LEAK. A presence check that
// accidentally echoes a character of the secret is worse than no presence
// check, because it looks responsible.
//
// The two that carry this suite:
//
//   * 'NO SECRET VALUE APPEARS ANYWHERE IN THE OUTPUT' — driven with a
//     distinctive secret and asserted against the serialised report, not
//     against the fields individually, so a value reaching ANY field fails.
//   * 'THE ABANDONED DEFAULT IS NOT `ok`' — it is 26 characters, so it clears
//     the length bound. A length-first classification reports the one
//     known-forgeable value as fine.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.config-readiness-check-'));
let m;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/config-readiness.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs', '--target', 'es2022',
      '--lib', 'es2022,dom', '--moduleResolution', 'node',
      '--esModuleInterop', '--strict',
    ],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'config-readiness.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('config-readiness compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { describeConfigReadiness, classifySecret, REQUIRED_SECRETS } = m;
const audit = await import(pathToFileURL(join(outDir, 'trustshell', 'receipt-audit.js')).href);
const { ABANDONED_DEFAULT_SECRET, MIN_AUDIT_SECRET_LENGTH } = audit;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };

const GOOD = 'a-genuinely-distinctive-secret-value-9f3a';

// ── it must not leak ────────────────────────────────────────────────────────

check('NO SECRET VALUE APPEARS ANYWHERE IN THE OUTPUT', () => {
  // Asserted against the SERIALISED report, not field by field. A value that
  // reached any field — present or future — fails here without the test needing
  // to know that field's name.
  const report = describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: GOOD });
  const serialised = JSON.stringify(report);
  truthy(!serialised.includes(GOOD), 'the whole value must be absent');
  // Substrings too: a prefix or suffix is still a leak, and is the likelier
  // accident (`value.slice(0, 4)` "for debugging").
  for (const piece of [GOOD.slice(0, 8), GOOD.slice(-8), GOOD.slice(10, 20)]) {
    truthy(!serialised.includes(piece), `no substring may appear (${piece})`);
  }
});

check('NO LENGTH IS DISCLOSED, even for a bad secret', () => {
  // `too_short` says a bound was missed. It must not say by how much — that is
  // the one number an attacker gains from.
  const short = describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: 'xxxxx' });
  const serialised = JSON.stringify(short);
  eq(short.secrets.TRUSTRAILS_HMAC_SECRET, 'too_short', 'it is reported short');
  truthy(!serialised.includes('5'), 'but the length must not appear');
});

check('THE ENVIRONMENT IS NEVER ENUMERATED', () => {
  // The endpoint's own rule: "a new platform variable cannot leak through it by
  // accident". Adding variables must change nothing.
  const withNoise = describeConfigReadiness({
    TRUSTRAILS_HMAC_SECRET: GOOD,
    SOME_OTHER_SECRET: 'should-never-be-mentioned',
    AWS_SECRET_ACCESS_KEY: 'nor-this',
    DATABASE_URL: 'postgres://u:p@h/db',
  });
  const serialised = JSON.stringify(withNoise);
  for (const leaked of ['SOME_OTHER_SECRET', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL', 'postgres://']) {
    truthy(!serialised.includes(leaked), `${leaked} must not appear`);
  }
  eq(Object.keys(withNoise.secrets), REQUIRED_SECRETS.map((r) => r.name),
     'exactly the allowlist, nothing more');
});

// ── it must classify honestly ───────────────────────────────────────────────

check('THE ABANDONED DEFAULT IS NOT `ok`', () => {
  // 26 characters, so it clears the length bound. The likeliest repair for a
  // missing variable is pasting this exact constant, and every audit hash under
  // it is forgeable because it is published in this repo and in git history.
  truthy(ABANDONED_DEFAULT_SECRET.length >= MIN_AUDIT_SECRET_LENGTH,
     'precondition: it is long enough to pass a length-only check');
  const r = describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: ABANDONED_DEFAULT_SECRET });
  eq(r.secrets.TRUSTRAILS_HMAC_SECRET, 'abandoned_default', 'it gets its own status');
  eq(r.ready, false, 'and the surface is NOT ready');
  truthy(r.blocking.includes('TRUSTRAILS_HMAC_SECRET'), 'and it is named as blocking');
});

check('order matters — the default is checked BEFORE the length bound', () => {
  // A length-first classification returns `ok` for the abandoned default, since
  // it is long enough. This pins the order, not just the outcome.
  eq(classifySecret(ABANDONED_DEFAULT_SECRET, { minLength: 1, rejectValue: ABANDONED_DEFAULT_SECRET }),
     'abandoned_default', 'even when the length bound is trivially satisfied');
});

check('FOUR STATES, and absent is distinguishable from bad', () => {
  const cases = [
    [undefined, 'missing'],
    ['', 'missing'],
    ['   ', 'missing'],
    ['x', 'too_short'],
    [ABANDONED_DEFAULT_SECRET, 'abandoned_default'],
    [GOOD, 'ok'],
  ];
  for (const [value, expected] of cases) {
    eq(describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: value }).secrets.TRUSTRAILS_HMAC_SECRET,
       expected, `${JSON.stringify(value)} classifies`);
  }
  // Two states would collapse "configured badly" into "fine", which is exactly
  // what an HMAC hides: both produce a well-formed hash.
  eq(new Set(cases.map(([, e]) => e)).size, 4, 'all four states are reachable');
});

check('`ready` is true ONLY when every allowlisted secret is ok', () => {
  eq(describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: GOOD }).ready, true, 'good config is ready');
  eq(describeConfigReadiness({}).ready, false, 'an empty environment is not');
  eq(describeConfigReadiness({}).blocking, ['TRUSTRAILS_HMAC_SECRET'], 'and says which');
  // The boundary, in both directions.
  eq(describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: 'x'.repeat(MIN_AUDIT_SECRET_LENGTH) }).ready,
     true, 'exactly at the floor is ready');
  eq(describeConfigReadiness({ TRUSTRAILS_HMAC_SECRET: 'x'.repeat(MIN_AUDIT_SECRET_LENGTH - 1) }).ready,
     false, 'one below is not');
});

check('the bound is IMPORTED from receipt-audit, not repeated', () => {
  // One rule, one implementation. Two copies of a threshold is the defect this
  // branch found four separate times.
  eq(REQUIRED_SECRETS.find((r) => r.name === 'TRUSTRAILS_HMAC_SECRET').minLength,
     MIN_AUDIT_SECRET_LENGTH, 'the presence check and the mint check agree by construction');
  eq(REQUIRED_SECRETS.find((r) => r.name === 'TRUSTRAILS_HMAC_SECRET').rejectValue,
     ABANDONED_DEFAULT_SECRET, 'and refuse the same value');
});

check('a surface reporting `ok` is one that would actually MINT', () => {
  // The whole point: this must agree with requireAuditSecret, or it reassures
  // about a surface that still throws. Drive both over the same inputs.
  const { requireAuditSecret } = audit;
  for (const value of [undefined, '', '   ', 'x', ABANDONED_DEFAULT_SECRET, GOOD]) {
    const env = { TRUSTRAILS_HMAC_SECRET: value };
    const saysOk = describeConfigReadiness(env).secrets.TRUSTRAILS_HMAC_SECRET === 'ok';
    let mints = true;
    try { requireAuditSecret(env); } catch { mints = false; }
    eq(saysOk, mints, `the report and the mint gate must agree on ${JSON.stringify(value)}`);
  }
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nconfig-readiness: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All config-readiness checks passed.');
