#!/usr/bin/env node
//
// check-legacy-key.mjs — does the leaked legacy `service_role` JWT still work?
//
//   node scripts/check-legacy-key.mjs
//
// `scan-secrets.mjs` answers "is the credential recoverable from history?" —
// yes, and it always will be. This answers the question that decides whether
// that matters: **is the API still accepting it?**
//
// The distinction the whole thing turns on: Supabase's "deactivate legacy API
// keys" switch is *reversible* (their migration guide says so explicitly —
// "You can re-activate them if you find a client you missed"). Deactivated is
// not revoked. The token is unchanged; it is signed by the project's JWT
// secret, so flipping the switch back makes the exact string in git history
// live again. Only revoking the signing key retires the token itself.
//
// So the honest states are three, not two:
//
//   LIVE       the API accepted it. Anyone with repo access has RLS bypass.
//   INERT      the API rejected it *because legacy keys are off*. Disarmed,
//              reversibly. Safe today, unsafe the moment someone re-enables.
//   RETIRED    rejected as a bad signature — the signing key changed. Gone.
//
// and one non-answer:
//
//   NOT MEASURED  the probe could not run. This is not a pass. A cloud session
//              cannot reach `*.supabase.co` (the agent proxy denies CONNECT and
//              curl reports HTTP 000), which is exactly how an unmeasured
//              credential came to be described as safe in SESSION_SUMMARY.md.
//              Run this from a laptop.
//
// Never prints a token. Exit 1 on LIVE, 2 on NOT MEASURED, 0 otherwise — a
// check that could not run must not be greppable as success.

import { execFileSync } from 'node:child_process';

const TIMEOUT_MS = 15_000;

function git(args, { allowNoMatch = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (err) {
    if (allowNoMatch && err.status === 1) return '';
    if (err.status === 128 || err.status === undefined) {
      throw new Error(
        `git ${args.slice(0, 2).join(' ')} failed (status ${err.status}): ` +
          `${String(err.stderr ?? '').trim() || err.message}`
      );
    }
    return '';
  }
}

// Same ERE as scan-secrets.mjs, and for the same reason: POSIX ERE has no
// non-capturing groups, so `(?:` makes every invocation exit 128. The trailing
// signature group is required here — a two-part JWT cannot authenticate
// anything, so there would be nothing to probe with.
const GIT_GREP_ERE = 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+';
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;

function claims(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/** Every complete legacy JWT anywhere in history, deduped, newest ref first. */
function collectLegacyJwts() {
  const found = new Map();
  const commits = git(['rev-list', '--all']).split('\n').filter(Boolean);
  for (const commit of commits) {
    const text = git(['grep', '-h', '-E', GIT_GREP_ERE, commit, '--'], { allowNoMatch: true });
    if (!text) continue;
    for (const token of text.match(JWT) ?? []) {
      if (found.has(token)) continue;
      const c = claims(token);
      if (!c.role) continue;
      found.set(token, { token, role: c.role, ref: c.ref ?? null, exp: c.exp ?? null });
    }
  }
  return [...found.values()];
}

/**
 * Did this response come from Supabase at all?
 *
 * The agent proxy answers a blocked host with **HTTP 403** and a plain-text
 * body — indistinguishable from an auth rejection if you only look at the
 * status code. The first version of this script did exactly that and printed
 * "No privileged legacy key was accepted" for a probe that never left the
 * container. CLAUDE.md already warns about this ("a 403 there is not an auth
 * failure and must not trigger a credential rotation"); it is worth a guard,
 * not just a note.
 *
 * PostgREST always answers with JSON. Anything else on this URL is an
 * intermediary talking, so it is a non-measurement.
 */
function interception(status, headers, body) {
  const deny = headers.get('x-deny-reason');
  if (deny) return `blocked by an egress proxy (x-deny-reason: ${deny})`;
  if (/not in allowlist|network egress|proxy|tunnel/i.test(body)) {
    return 'blocked by an egress proxy (matched a denial message, not a PostgREST body)';
  }
  const type = headers.get('content-type') ?? '';
  if (!type.includes('json')) {
    return `answered ${status} with content-type "${type || 'none'}" — PostgREST always returns JSON, so this is an intermediary`;
  }
  return null;
}

/**
 * Classify one probe. PostgREST answers a rejected legacy key with a message
 * that says *why*, and the why is the whole point — "legacy keys are disabled"
 * and "signature verification failed" have different remediations.
 */
function classify(status, headers, body) {
  const blocked = interception(status, headers, body);
  if (blocked) return { state: 'NOT MEASURED', why: blocked };

  const text = String(body).toLowerCase();
  if (status >= 200 && status < 300) return { state: 'LIVE', why: `HTTP ${status} — request accepted` };
  if (/legacy|disabled|deactivat/.test(text)) {
    return { state: 'INERT', why: `HTTP ${status} — rejected as a disabled legacy key` };
  }
  if (/signature|invalid jwt|jwsinvalid|malformed/.test(text)) {
    return { state: 'RETIRED', why: `HTTP ${status} — signature no longer verifies` };
  }
  if (status === 401 || status === 403) {
    return { state: 'REJECTED', why: `HTTP ${status} from PostgREST — rejected, reason not stated` };
  }
  return { state: 'NOT MEASURED', why: `HTTP ${status} — unexpected response` };
}

async function probe(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return classify(res.status, res.headers, await res.text().catch(() => ''));
  } catch (e) {
    // Network failure is not a rejection. Say so, loudly.
    return { state: 'NOT MEASURED', why: `probe could not run: ${e?.cause?.code ?? e?.name ?? e?.message}` };
  } finally {
    clearTimeout(timer);
  }
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'https://qnnpjhlxljtqyigedwkb.supabase.co';

const legacy = collectLegacyJwts();
if (legacy.length === 0) {
  console.log('No complete legacy JWT found in history. Nothing to probe.');
  process.exit(0);
}

console.log(`Probing ${url}\n`);

let live = 0;
let unmeasured = 0;

for (const key of legacy) {
  const { state, why } = await probe(url, key.token);
  if (state === 'LIVE' && key.role !== 'anon') live++;
  if (state === 'NOT MEASURED') unmeasured++;

  const expiry = key.exp ? new Date(key.exp * 1000).toISOString().slice(0, 10) : 'unreadable';
  console.log(
    `${state.padEnd(13)} role=${String(key.role).padEnd(13)} ref=${key.ref ?? '?'} exp=${expiry}\n` +
      `${' '.repeat(14)}${why}`
  );
}

console.log('');
if (live > 0) {
  console.log(
    `${live} privileged legacy key still LIVE. It bypasses RLS and is in git history.\n` +
      'Remediation is in docs/KEY-ROTATION.md — note that the legacy JWT secret can no\n' +
      'longer be rotated, so the path is: deactivate legacy keys, then migrate to JWT\n' +
      'signing keys and revoke the old one.'
  );
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(
    `${unmeasured} key(s) NOT MEASURED — this run proves nothing about them.\n` +
      'From a cloud session that is expected: the agent proxy denies CONNECT to\n' +
      '*.supabase.co. Re-run from a laptop before recording any verdict.'
  );
  process.exit(2);
}
console.log('No privileged legacy key was accepted.');
console.log(
  'If the state above is INERT rather than RETIRED, the key is disarmed but not\n' +
    'retired: re-enabling legacy API keys makes the string in git history live again.'
);
process.exit(0);
