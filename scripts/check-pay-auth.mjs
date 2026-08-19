// scripts/check-pay-auth.mjs
//
// The payment route had no authentication at all.
//
// `app/api/trustrails/pay/route.ts` accepted any request that named an agent
// present in `agent_kya_registry`. That is a lookup, not a credential — agent
// names are not secret, and the route moves money and writes reputation.
//
// ── WHY THIS SUITE ASSERTS OBSERVE MODE RATHER THAN ENFORCEMENT ─────────────
//
// Whether the route should be callable by anyone is a policy question. Turning
// authentication on unilaterally would break every existing caller in one
// commit, and nobody can currently say how many that is. So the module ships in
// OBSERVE mode — the same posture as `bftEnforcementMode` and the ControlProof
// shadow on this very route — and the field it produces,
// `wouldDenyUnderEnforcement`, is the measurement that makes the switch a
// decision instead of a guess.
//
// The assertions therefore pin two different things, and both matter:
//   1. observe mode ALLOWS everything, and says so in the payload;
//   2. enforce mode denies exactly what it should, including the case where the
//      SERVER is misconfigured.
//
// Getting (1) wrong breaks production the moment this merges. Getting (2) wrong
// means the switch does nothing when it is finally flipped, which is worse
// because it will look like it worked.
//
// ── NOT_CHECKED DENIES UNDER ENFORCEMENT, AND THAT IS A CHOICE ──────────────
//
// The same route makes this trade in both directions on purpose. The RepID
// threshold DENIES when it cannot evaluate ("a limit that could not be evaluated
// is not a limit that passed"); BFT ALLOWS with disclosure, because a provider
// outage is not a consensus failure. Authentication follows the threshold: an
// unconfigured secret must not become an open door reached by a missing
// environment variable.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { localTsc } from './local-tsc.mjs';
import { stripComments } from './lib/module-specifiers.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.pay-auth-check-'));
let A;
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022', 'dom'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [join(process.cwd(), 'lib/trustshell/pay-auth.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  A = await import(pathToFileURL(join(outDir, 'lib/trustshell/pay-auth.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lib/trustshell/pay-auth.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

let pass = 0;
const failures = [];
function check(name, fn) {
  const settle = (r) => {
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  };
  try {
    const r = fn();
    return r instanceof Promise ? r.then(settle, (e) => failures.push(`${name}: threw ${e.message}`)) : settle(r);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

const SECRET = 'a-real-secret-of-sufficient-length';
const ABANDONED = 'trinity-default-sbt-secret';
const NOW = 1_755_000_000_000;
// Node's own HMAC, not the module's. An implementation checked against itself
// agrees with itself; this is an independent oracle.
const hmac = async (secret, message) =>
  createHmac('sha256', secret).update(message).digest('hex');

const BODY = JSON.stringify({ agentName: 'agent-x', amountUSDC: 100 });
const sign = (body, ts, secret = SECRET) =>
  createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

// ── 1. Mode defaults ────────────────────────────────────────────────────────

check('the mode defaults to observe on an empty environment', () =>
  A.payAuthMode({}) === 'observe' ? true : `defaulted to ${A.payAuthMode({})}`);

check('only the exact string "enforce" enforces', () => {
  for (const v of ['enforced', 'ENFORCE', 'true', '1', 'yes', '']) {
    if (A.payAuthMode({ PAY_AUTH_MODE: v }) !== 'observe') return `"${v}" turned enforcement on`;
  }
  return A.payAuthMode({ PAY_AUTH_MODE: 'enforce' }) === 'enforce'
    ? true
    : '"enforce" did not enforce';
});

// ── 2. Observe mode ALLOWS — this is what protects production on merge ──────

check('observe mode allows EVERY outcome', () => {
  for (const outcome of ['VERIFIED', 'NOT_CHECKED', 'FAILED']) {
    const d = A.payAuthDecision({ outcome, detail: 'x' }, 'observe');
    if (!d.allow) return `observe mode denied on ${outcome} — this would break every live caller`;
  }
  return true;
});

check('observe mode still reports what enforcement WOULD do', () => {
  const failed = A.payAuthDecision({ outcome: 'FAILED', detail: 'bad sig' }, 'observe');
  const ok = A.payAuthDecision({ outcome: 'VERIFIED', detail: 'fine' }, 'observe');
  return failed.wouldDenyUnderEnforcement && !ok.wouldDenyUnderEnforcement
    ? true
    : 'wouldDenyUnderEnforcement does not track the verdict — the whole measurement is that field';
});

check('an observe-mode allow SAYS it is an observe-mode allow', () => {
  const d = A.payAuthDecision({ outcome: 'FAILED', detail: 'bad sig' }, 'observe');
  return /observe/i.test(d.detail) && /denied under enforce/i.test(d.detail)
    ? true
    : `an unauthenticated request was allowed with the detail: ${d.detail}`;
});

// ── 3. Enforce mode denies what it must ─────────────────────────────────────

check('enforce mode allows ONLY a verified signature', () => {
  const allowed = ['VERIFIED', 'NOT_CHECKED', 'FAILED'].filter(
    (o) => A.payAuthDecision({ outcome: o, detail: 'x' }, 'enforce').allow
  );
  return allowed.length === 1 && allowed[0] === 'VERIFIED'
    ? true
    : `enforce mode allows: ${allowed.join(', ')}`;
});

check('enforce mode denies when the SERVER is misconfigured', () =>
  !A.payAuthDecision({ outcome: 'NOT_CHECKED', detail: 'no secret' }, 'enforce').allow
    ? true
    : 'a missing TRUSTRAILS_HMAC_SECRET became an open door');

// ── 4. The secret itself ────────────────────────────────────────────────────

check('an absent secret is NOT_CHECKED, not a pass and not a failure', () => {
  const v = A.secretUsable(undefined);
  return v?.outcome === 'NOT_CHECKED' ? true : `got ${v?.outcome ?? 'null'}`;
});

check('the PUBLISHED abandoned default is refused, and refused BEFORE the length test', () => {
  // It is 26 characters — comfortably over the 16-character bound — so a
  // length-first order reports the one known-forgeable value as fine. Same
  // ordering trap classifySecret documents in config-readiness.ts.
  if (ABANDONED.length < 16) return 'fixture is wrong: the abandoned default is short';
  const v = A.secretUsable(ABANDONED);
  return v?.outcome === 'NOT_CHECKED' && /forge/i.test(v.detail)
    ? true
    : `the published default was accepted (${v?.outcome ?? 'null'})`;
});

check('a short secret is refused', () =>
  A.secretUsable('tooshort')?.outcome === 'NOT_CHECKED' ? true : 'a short secret was accepted');

check('a usable secret returns null — no verdict, carry on', () =>
  A.secretUsable(SECRET) === null ? true : 'a good secret produced a verdict');

// ── 5. Signature verification, against an independent oracle ────────────────

await check('a correctly signed request VERIFIES', async () => {
  const ts = String(NOW);
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: `sha256=${sign(BODY, ts)}`, timestamp: ts,
    secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'VERIFIED' ? true : `${v.outcome}: ${v.detail}`;
});

await check('the module agrees with node:crypto — its own HMAC is not self-graded', async () => {
  const ts = String(NOW);
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: sign(BODY, ts), timestamp: ts, secret: SECRET, now: NOW,
    // No `hmac` override: this exercises hmacSha256Hex via WebCrypto and
    // compares it against a signature node:crypto produced.
  });
  return v.outcome === 'VERIFIED'
    ? true
    : `WebCrypto and node:crypto disagree on HMAC-SHA256: ${v.detail}`;
});

await check('a MODIFIED body fails — the signature binds the payment, not the route', async () => {
  const ts = String(NOW);
  const signature = sign(BODY, ts);
  const tampered = JSON.stringify({ agentName: 'agent-x', amountUSDC: 100000 });
  const v = await A.verifyPaySignature({
    rawBody: tampered, signature, timestamp: ts, secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'FAILED'
    ? true
    : `a signature for 100 USDC authorised 100000 USDC (${v.outcome})`;
});

await check('a signature from a DIFFERENT secret fails', async () => {
  const ts = String(NOW);
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: sign(BODY, ts, 'another-secret-entirely-long'),
    timestamp: ts, secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'FAILED' ? true : `outcome ${v.outcome}`;
});

await check('a MISSING signature is FAILED, not NOT_CHECKED', async () => {
  // NOT_CHECKED means the server could not evaluate. A caller presenting nothing
  // is a completed check with a negative result, and conflating the two would
  // let every unsigned request through under enforcement.
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: null, timestamp: String(NOW), secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'FAILED' ? true : `an unsigned request reported ${v.outcome}`;
});

await check('a STALE timestamp fails', async () => {
  const old = String(NOW - A.SIGNATURE_WINDOW_MS - 1);
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: sign(BODY, old), timestamp: old, secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'FAILED' ? true : `a signature ${A.SIGNATURE_WINDOW_MS / 1000}s+ old was accepted`;
});

await check('a FUTURE timestamp beyond the window fails', async () => {
  // Otherwise a caller mints a signature that stays valid long after rotation.
  const ahead = String(NOW + A.SIGNATURE_WINDOW_MS + 1);
  const v = await A.verifyPaySignature({
    rawBody: BODY, signature: sign(BODY, ahead), timestamp: ahead, secret: SECRET, now: NOW, hmac,
  });
  return v.outcome === 'FAILED' ? true : 'a future-dated signature was accepted';
});

// ── 6. Details that are easy to get subtly wrong ───────────────────────────

check('the timestamp is bound INTO the signature, not merely checked beside it', () => {
  // If the payload were just the body, a captured signature would stay valid
  // forever by resending it with a fresh timestamp.
  const p = A.signingPayload('123', 'BODY');
  return p.includes('123') && p.startsWith('123')
    ? true
    : `signingPayload is "${p}" — the timestamp must be inside what gets signed`;
});

check('the signature header accepts sha256= and bare hex, and rejects anything else', () => {
  const hex = 'a'.repeat(64);
  if (A.parseSignatureHeader(`sha256=${hex}`) !== hex) return 'sha256= prefix not stripped';
  if (A.parseSignatureHeader(hex) !== hex) return 'bare hex rejected';
  for (const bad of ['', null, undefined, 'sha256=', 'a'.repeat(63), 'z'.repeat(64), 'sha1=' + hex]) {
    if (A.parseSignatureHeader(bad) !== null) return `accepted "${String(bad)}"`;
  }
  return true;
});

check('digest comparison has NO early exit — a structural proxy, stated as one', () => {
  // Behavioural assertions cannot see this. `constantTimeEqual` and an
  // early-returning implementation agree on every input; they differ only in HOW
  // LONG they take, and timing a function in a build gate is flaky enough to be
  // worse than no gate. The `pay-auth-digest-compare-leaks-timing` mutation
  // SURVIVED against the correctness checks below for exactly that reason —
  // cause 1 in the mutation manifest's list: no assertion covered the property.
  //
  // So this reads the source. A structural proxy is weaker than a behavioural
  // assertion and is worth having anyway: it catches the one edit that actually
  // reintroduces the leak, and it is honest about being a proxy rather than
  // dressed up as a measurement of time.
  const src = stripComments(readFileSync('lib/trustshell/pay-auth.ts', 'utf8'));
  const body = src.slice(src.indexOf('export function constantTimeEqual'));
  const loop = body.slice(body.indexOf('for ('), body.indexOf('return diff === 0'));
  return !/\breturn\b/.test(loop)
    ? true
    : 'the comparison loop returns early — how long the check takes then reveals how many ' +
      'leading bytes were right, which recovers a signature one byte at a time';
});

check('digest comparison is correct and length-safe', () => {
  const a = 'a'.repeat(64);
  if (!A.constantTimeEqual(a, a)) return 'equal digests compared unequal';
  if (A.constantTimeEqual(a, 'a'.repeat(63))) return 'different lengths compared equal';
  if (A.constantTimeEqual(a, 'b' + 'a'.repeat(63))) return 'a first-byte mismatch compared equal';
  if (A.constantTimeEqual(a, 'a'.repeat(63) + 'b')) return 'a last-byte mismatch compared equal';
  return true;
});

// ── 7. The wiring ──────────────────────────────────────────────────────────

const route = stripComments(readFileSync('app/api/trustrails/pay/route.ts', 'utf8'));

check('the route reads the RAW body, not a re-serialised object', () =>
  /const rawBody = await req\.text\(\)/.test(route) && /JSON\.parse\(rawBody\)/.test(route)
    ? true
    : 'the route does not sign over the raw body — `req.json()` loses key order and ' +
      'whitespace, so the server would verify a different string than the caller signed');

check('authentication runs BEFORE the KYA lookup', () => {
  const auth = route.indexOf('verifyPaySignature');
  const kya = route.indexOf('kya.validate');
  if (auth === -1) return 'the route does not call verifyPaySignature';
  return auth < kya
    ? true
    : 'the KYA lookup runs before authentication — an unauthenticated caller reaches the registry';
});

check('the route discloses the auth outcome and what enforcement would do', () =>
  /wouldDenyUnderEnforcement: auth\.wouldDenyUnderEnforcement/.test(route)
    ? true
    : 'the response does not carry wouldDenyUnderEnforcement — without it, observe mode ' +
      'measures nothing and the switch stays a guess');

check('the deny path returns 401, and only when the decision says so', () =>
  /if \(!auth\.allow\) \{/.test(route) && /status: 401/.test(route)
    ? true
    : 'the route does not deny on !auth.allow with a 401');

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — payment auth evaluates and discloses, and enforces only when told`);
