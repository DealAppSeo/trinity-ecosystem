// scripts/check-auth-session.mjs
//
// The sign-in / sign-out transitions, gated.
//
// This suite exists because a fix shipped without one. `app/login/page.tsx`
// discarded the result of `signOut()` and cleared the UI unconditionally, so a
// FAILED sign-out rendered "signed out" over a live session. The fix was three
// lines; gating it was impossible, because every suite here drives a pure module
// under `lib/` and a client component is exactly what none of them can see.
//
// So the transitions moved to `lib/auth-session.ts` and this suite drives them.
// The component now renders and decides nothing.
//
// THE PROPERTY WORTH THE FILE: on failure, keep the state that is TRUE rather
// than the one that is tidy. A failed sign-out leaves you signed IN. The
// reassuring reading is the wrong one, and it is the one a shared machine
// punishes.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.auth-session-check-'));
let A;
try {
  execFileSync(
    localTsc(),
    [
      'lib/auth-session.ts',
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
  A = await import(pathToFileURL(join(outDir, 'auth-session.js')).href);
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

const SIGNED_IN = { status: 'signed-in', email: 'ops@example.com', error: null };

// ── the defect this file was written for ────────────────────────────────────

check('A FAILED SIGN-OUT KEEPS YOU SIGNED IN — the whole point', () => {
  const after = A.applySignOutResult({ error: { message: 'network unreachable' } }, SIGNED_IN);
  eq(after.status, 'signed-in', 'status must NOT become idle');
  eq(after.email, 'ops@example.com', 'the address must survive — it is still the session');
  truthy(after.error, 'and the failure must be reported');
  truthy(/still signed in/.test(after.error), `the message must say so plainly: ${after.error}`);
});

check('a SUCCESSFUL sign-out clears everything', () => {
  const after = A.applySignOutResult({}, SIGNED_IN);
  eq(after.status, 'idle', 'status');
  eq(after.email, null, 'no lingering address');
  eq(after.error, null, 'no error');
  eq(A.isSafelySignedOut(after), true, 'and it is safe to walk away');
});

check('isSafelySignedOut SEPARATES the two — which is why it has a name', () => {
  // At a call site `status !== 'signed-in'` looks equivalent. It is not, and the
  // failed sign-out is exactly where they differ.
  const failed = A.applySignOutResult({ error: { message: 'boom' } }, SIGNED_IN);
  eq(A.isSafelySignedOut(failed), false, 'a failed sign-out is NOT safely signed out');
  eq(failed.status !== 'signed-in', false, 'and the naive predicate would disagree');
  // A cleared view that still carries an error is also not safe.
  eq(
    A.isSafelySignedOut({ status: 'idle', email: null, error: 'something went wrong' }),
    false,
    'an error present means we do not know'
  );
});

// ── the probe ───────────────────────────────────────────────────────────────

check('a THROWN probe is not a signed-out user', () => {
  // A missing or misconfigured Supabase key throws here. Treating that as
  // "logged out" renders a login form that cannot possibly work, with nothing
  // said — a broken deployment made to look like an ordinary session end.
  const view = A.applySessionProbe({ error: { message: 'supabaseKey is required' } });
  eq(view.status, 'idle', 'no session to claim');
  truthy(view.error, 'but the reason must be carried');
  eq(A.isSafelySignedOut(view), false, 'and it is not a clean signed-out state');
});

check('a probe finding a session reports it; an empty one does not invent it', () => {
  const found = A.applySessionProbe({ data: { session: { user: { email: 'a@b.c' } } } });
  eq(found.status, 'signed-in', 'session found');
  eq(found.email, 'a@b.c', 'email');
  for (const empty of [{}, { data: null }, { data: { session: null } }, { data: { session: { user: null } } }]) {
    const v = A.applySessionProbe(empty);
    eq(v.status, 'idle', `no session in ${JSON.stringify(empty)}`);
    eq(v.email, null, 'and no invented address');
    eq(v.error, null, 'an absent session is not an error');
  }
});

// ── sign-in ─────────────────────────────────────────────────────────────────

check('a failed sign-in reports the reason and grants nothing', () => {
  const v = A.applySignInResult({ error: { message: 'Invalid login credentials' } }, 'a@b.c');
  eq(v.status, 'idle', 'not signed in');
  eq(v.email, null, 'no address — the credentials were rejected');
  eq(v.error, 'Invalid login credentials', 'the reason, unmodified');
});

check('a sign-in with no echoed address falls back to what was typed', () => {
  // The sign-in SUCCEEDED, so "signed in as null" would be the bigger lie.
  const v = A.applySignInResult({ data: { user: {} } }, 'typed@example.com');
  eq(v.status, 'signed-in', 'signed in');
  eq(v.email, 'typed@example.com', 'echo the submitted address');
  eq(v.error, null, 'no error');
  const withEmail = A.applySignInResult({ data: { user: { email: 'real@x.io' } } }, 'typed@example.com');
  eq(withEmail.email, 'real@x.io', "the server's address wins when present");
});

// ── the component must not re-implement any of this ─────────────────────────

check('the login page DELEGATES — no transition logic left in the component', () => {
  const page = readFileSync('app/login/page.tsx', 'utf8');
  for (const fn of ['applySessionProbe', 'applySignInResult', 'applySignOutResult']) {
    truthy(page.includes(fn), `page must call ${fn}`);
  }
  // The old shape: three loose useStates the transitions could set piecemeal.
  truthy(!/setStatus\(/.test(page), 'no setStatus — the view moves as one unit');
  truthy(!/setCurrentEmail\(/.test(page), 'no setCurrentEmail');
  truthy(
    !/auth\.signOut\(\);\s*\n\s*setView\(SIGNED_OUT\)/.test(page),
    'sign-out must not clear the view without consulting the result'
  );
});

check('THE ERROR IS REACHABLE IN THE SIGNED-IN BRANCH', () => {
  // Caught while writing this suite: a failed sign-out leaves status
  // 'signed-in', but the error paragraph originally rendered only in the form
  // branch — which that state never reaches. The message would have been set
  // and never shown, replacing a FALSE "signed out" with a SILENT one.
  const page = readFileSync('app/login/page.tsx', 'utf8');
  const signedInBranch = page.slice(
    page.indexOf("status === 'signed-in' ?"),
    page.indexOf('<form onSubmit={signIn}>')
  );
  truthy(signedInBranch.length > 0, 'located the signed-in branch');
  truthy(
    /\{error &&/.test(signedInBranch),
    'the signed-in branch must render the error, or a failed sign-out says nothing'
  );
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nauth-session: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — the session transitions do not hold.\n');
  process.exit(1);
}
console.log('All auth-session checks passed.\n');
