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

import { execFileSync, spawnSync } from 'node:child_process';

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

/** Largest blob we will read. Above this it is an archive or a media file. */
const MAX_BLOB_BYTES = 2_000_000;
/** Blobs per `cat-file --batch` invocation. Bounds peak memory, not correctness. */
const BLOB_BATCH = 512;

/**
 * Every complete legacy JWT anywhere in history, deduped.
 *
 * SCANS UNIQUE BLOBS, NOT COMMITS — for two separate reasons, one speed and one
 * correctness, and the second is why this is not merely an optimisation.
 *
 * SPEED. The previous version ran one `git grep <commit>` per commit: 710
 * subprocesses, each re-reading every file in that commit's tree. A file
 * unchanged for 700 commits was scanned 700 times. Measured 2026-08-16 on this
 * repo: **28.9s**, against **0.97s** for 5,553 unique blobs — the same content,
 * read once each.
 *
 * CORRECTNESS. `git grep` SKIPS BINARY FILES by default, and that is a blind
 * spot in a credential scanner rather than a preference. Switching to blobs
 * immediately found a sixth legacy JWT the per-commit scan had never reported,
 * inside `trinity-science/app/__pycache__/anfis_router.cpython-313.pyc` — a
 * committed .pyc. That token is `role=anon` and every legacy key on this project
 * is disabled, so it is inert; the point is that a `service_role` token
 * committed inside ANY binary — a .pyc, a build artifact, a bundled archive —
 * would have been equally invisible. A scanner that cannot see a file class
 * reports clean about a place it never looked.
 *
 * The batch stream is parsed by the declared object size rather than regexed
 * whole, so a token can never be manufactured across two blobs' boundary.
 */
function collectLegacyJwts() {
  const found = new Map();

  // oid -> a path it was seen at, for the report. rev-list gives "<oid> <path>".
  const pathByOid = new Map();
  for (const line of git(['rev-list', '--objects', '--all']).split('\n')) {
    if (!line) continue;
    const sp = line.indexOf(' ');
    if (sp === -1) pathByOid.set(line, '');
    else pathByOid.set(line.slice(0, sp), line.slice(sp + 1));
  }

  const check = spawnSync(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    { input: [...pathByOid.keys()].join('\n'), encoding: 'utf8', maxBuffer: 1 << 30 }
  );
  const blobs = [];
  for (const line of String(check.stdout ?? '').split('\n')) {
    const [oid, type, size] = line.split(' ');
    if (type === 'blob' && Number(size) <= MAX_BLOB_BYTES) blobs.push(oid);
  }

  const record = (text, oid) => {
    for (const token of text.match(JWT) ?? []) {
      if (found.has(token)) continue;
      const c = claims(token);
      if (!c.role) continue;
      found.set(token, {
        token,
        role: c.role,
        ref: c.ref ?? null,
        exp: c.exp ?? null,
        path: pathByOid.get(oid) || '(unnamed blob)',
      });
    }
  };

  for (let i = 0; i < blobs.length; i += BLOB_BATCH) {
    const batch = blobs.slice(i, i + BLOB_BATCH);
    // latin1 so every byte round-trips: a JWT is ASCII, and utf8 decoding of a
    // binary blob would replace bytes and could split a match.
    const out = spawnSync('git', ['cat-file', '--batch'], {
      input: batch.join('\n'),
      encoding: 'latin1',
      maxBuffer: 1 << 30,
    });
    const stream = String(out.stdout ?? '');
    // "<oid> blob <size>\n" then exactly <size> bytes then "\n".
    let pos = 0;
    while (pos < stream.length) {
      const nl = stream.indexOf('\n', pos);
      if (nl === -1) break;
      const [oid, type, size] = stream.slice(pos, nl).split(' ');
      const bytes = Number(size);
      if (type !== 'blob' || !Number.isFinite(bytes)) break;
      record(stream.slice(nl + 1, nl + 1 + bytes), oid);
      pos = nl + 1 + bytes + 1;
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
  // Greppable THIRD outcome. This neither passed nor failed — the network was
  // unreachable — and forcing it into a passed/failed line would collapse
  // "we could not look" into "it is fine", which is the defect this repo names.
  console.log('check-legacy-key: NOT CHECKED (network denied from this container)');
  process.exit(2);
}
console.log('No privileged legacy key was accepted.');
console.log(
  'If the state above is INERT rather than RETIRED, the key is disarmed but not\n' +
    'retired: re-enabling legacy API keys makes the string in git history live again.'
);
process.exit(0);
