#!/usr/bin/env node
//
// scan-secrets.mjs — find credentials in the working tree and, optionally, in
// git history. Reports what kind of credential each hit is and whether it is
// complete enough to use. Never prints a secret value.
//
//   node scripts/scan-secrets.mjs              # tracked files at HEAD
//   node scripts/scan-secrets.mjs --history    # every commit reachable from any ref
//
// Exit code is 1 if a *usable privileged* credential is found in the working
// tree, 0 otherwise. History hits never fail the run: history cannot be edited
// by a normal commit, so failing on it would make the check permanently red and
// therefore ignored. They are reported as findings to act on by rotation.
//
// Why this exists. A `service_role` JWT for this project was committed in
// `.env.local` and lived in history from 2026-04-17 to 2026-07-25 with an `exp`
// in 2035. Nothing in the repo would have told you. Finding it took an ad-hoc
// scan; this is that scan, kept.

import { execFileSync } from 'node:child_process';

const HISTORY = process.argv.includes('--history');

// A Supabase/PostgREST legacy key is a JWT. Three segments means header,
// payload and signature — i.e. usable. Two means the value was truncated
// somewhere (a log, an audit dump) and cannot authenticate anything.
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g;

// Base58 with no 0/O/I/l. 87-88 chars is an ed25519 secret key (64 bytes) —
// but it is also exactly the length of a Solana *transaction signature*, which
// is public and appears in every Explorer URL. Length alone cannot tell them
// apart, so the match is only called a secret when an assignment to a
// secret-shaped name precedes it. Everything else is reported as ambiguous
// rather than silently promoted or silently dropped.
// (43-44 chars is a public key: not a secret, not reported.)
const SOLANA_B58 = /(?<![A-HJ-NP-Za-km-z1-9])[A-HJ-NP-Za-km-z1-9]{87,88}(?![A-HJ-NP-Za-km-z1-9])/g;
const SECRET_ASSIGNMENT = /(PRIVKEY|PRIVATE_KEY|SECRET_BYTES|SECRET_KEY|KEYPAIR|SECRET)\s*[=:]\s*[`'"]?$/i;

const OPAQUE = /\b(sb_secret_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})\b/g;

// An EVM private key is 32 bytes of hex. So is a transaction hash, a block
// hash, a keccak digest, a merkle root and a storage commitment — and this repo
// contains all of those. Length cannot separate them, so the Solana rule above
// is reused: a match is only called a secret when an assignment to a key-shaped
// name precedes it. Everything else is reported as ambiguous.
//
// Why this exists. This scanner was written for the Supabase JWT incident and
// covered JWTs, Solana base58 and prefixed opaque keys. It did not cover the
// one chain this project actually deploys to. A funded Base Sepolia key sat in
// `scripts/register-agents-erc8004.js` across several commits and this scan
// printed "No credential-shaped strings found" over it. That key owned three of
// the four ERC-8004 agent identities, so anyone reading the repo could transfer
// them or rewrite their on-chain metadata.
const EVM_HEX32 = /(?<![0-9a-fA-Fx])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
// `=` and `:` cover a direct assignment. `||` and `??` cover the far more
// common shipping shape — `process.env.DEPLOYER_PRIVATE_KEY || '0x…'` — where
// the literal is a fallback. That form reads as a harmless default and is not:
// it is the value used on every machine where the variable is unset.
const EVM_ASSIGNMENT =
  /(?:[A-Z0-9_]*(?:PRIV|SECRET|SIGNER|DEPLOYER|MNEMONIC|WALLET|ACCOUNT)[A-Z0-9_]*|[A-Z0-9_]*KEY)\s*(?:[=:]|\|\||\?\?)\s*[`'"]?$/i;

// A key whose bytes are a short repeating unit (0xabcdabcd…) or all one value
// (0x0000…) is a placeholder someone typed. It is reported anyway, and reported
// as usable, because viem derives a real fundable address from it exactly like
// any other key: the moment that address is sent testnet ETH the placeholder is
// a live signer whose key is public. A default that is a valid key is a
// credential, not a comment.
function isPlaceholderHex(hex) {
  const body = hex.slice(2).toLowerCase();
  for (const unit of [1, 2, 4, 8, 16]) {
    const head = body.slice(0, unit);
    if (body === head.repeat(64 / unit)) return true;
  }
  return false;
}

// `git grep` takes POSIX ERE, which has no non-capturing groups and no
// lookaround. Passing the JavaScript patterns above makes every invocation exit
// 128 with "Invalid preceding regular expression" — and if that error is
// swallowed, the scan reports a clean history it never actually searched. This
// is the coarse net; the JavaScript regexes re-filter whatever it returns.
// The trailing signature group is optional and must be a plain capturing group:
// ERE rejects `(?:`, but `(` is fine. Without it the grep stops after the
// payload and every complete JWT gets reported as "truncated" — which reads as
// harmless and is the opposite of the truth.
const GIT_GREP_ERE = [
  'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)?',
  '[A-HJ-NP-Za-km-z1-9]{87,88}',
  'sb_secret_[A-Za-z0-9_-]{8,}',
  '0x[0-9a-fA-F]{64}',
].join('|');

// git distinguishes "ran, found nothing" (exit 1) from "could not run" (exit
// 128, or a signal). Collapsing those into an empty string is how a scanner
// reports success it has not earned, so only exit 1 is treated as no-match.
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

function describeJwt(token) {
  const parts = token.split('.');
  const complete = parts.length === 3;
  let role = 'unknown';
  let exp = null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    role = claims.role ?? 'unknown';
    exp = claims.exp ?? null;
  } catch {
    // A truncated payload will not parse. That is itself the finding.
  }
  return { complete, role, exp };
}

// anon is published in the browser bundle by design, so it is not a secret.
// Everything else with a role claim bypasses or elevates past RLS.
const PRIVILEGED = (role) => role !== 'anon' && role !== 'unknown';

function scanText(text, where, sink) {
  for (const token of text.match(JWT) ?? []) {
    const { complete, role, exp } = describeJwt(token);
    sink.push({
      where,
      kind: `jwt:${role}`,
      complete,
      usable: complete && PRIVILEGED(role),
      detail: exp ? `exp ${new Date(exp * 1000).toISOString().slice(0, 10)}` : 'exp unreadable',
      fingerprint: `${token.slice(0, 12)}… (${token.length} chars, ${token.split('.').length} parts)`,
    });
  }
  for (const match of text.matchAll(SOLANA_B58)) {
    const key = match[0];
    const preceding = text.slice(Math.max(0, match.index - 40), match.index);
    const assigned = SECRET_ASSIGNMENT.test(preceding);
    sink.push({
      where,
      kind: assigned ? 'solana:secret-key' : 'solana:base58-88',
      complete: true,
      usable: assigned,
      detail: assigned
        ? `${key.length}-char base58 assigned to a secret-named variable`
        : `${key.length}-char base58, ambiguous — also the length of a tx signature`,
      fingerprint: `${key.slice(0, 6)}…`,
    });
  }
  for (const match of text.matchAll(EVM_HEX32)) {
    const key = match[0];
    const preceding = text.slice(Math.max(0, match.index - 60), match.index);
    const assigned = EVM_ASSIGNMENT.test(preceding);
    const placeholder = isPlaceholderHex(key);
    sink.push({
      where,
      kind: assigned ? (placeholder ? 'evm:secret-key-placeholder' : 'evm:secret-key') : 'evm:hex32',
      complete: true,
      usable: assigned,
      detail: assigned
        ? placeholder
          ? 'repeating-pattern hex assigned to a key-named variable — still derives a real, fundable address'
          : '32-byte hex assigned to a key-named variable'
        : '32-byte hex, ambiguous — also the shape of a tx hash, block hash or merkle root',
      fingerprint: `${key.slice(0, 8)}…`,
    });
  }
  for (const key of text.match(OPAQUE) ?? []) {
    const prefix = key.split('_').slice(0, 2).join('_');
    sink.push({
      where,
      kind: `opaque:${prefix}`,
      complete: true,
      usable: true,
      detail: `${key.length} chars`,
      fingerprint: `${key.slice(0, 10)}…`,
    });
  }
}

const findings = [];

// Say which repo is being scanned, before scanning it.
// `git ls-files` resolves against the SHELL's cwd, not this file's location, so
// running `node ../other-repo/scripts/scan-secrets.mjs` from the wrong
// directory silently audits the wrong repository and prints a clean result for
// it. That happened. Echoing the resolved target makes the mistake visible in
// the first line of output instead of never. See LESSONS D4.
const repoRoot = git(['rev-parse', '--show-toplevel']).trim();
const remote = git(['remote', 'get-url', 'origin'], { allowNoMatch: true }).trim() || '(no origin)';
console.log(`scanning ${repoRoot}\n         ${remote}\n`);

const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
for (const file of tracked) {
  // -I skips binary; a lockfile carries integrity hashes that look like nothing
  // else but produce no useful signal here.
  if (file === 'package-lock.json' || file.endsWith('.pack')) continue;
  const blob = git(['show', `HEAD:${file}`]);
  if (blob) scanText(blob, file, findings);
}

if (HISTORY) {
  const commits = git(['rev-list', '--all']).split('\n').filter(Boolean);
  process.stderr.write(`scanning ${commits.length} commits…\n`);
  const seen = new Set(findings.map((f) => f.fingerprint));
  for (const commit of commits) {
    // Whole matching lines, not `-o`. The assignment check above needs the text
    // *before* the match to tell a secret key from a transaction signature, and
    // `-o` throws that context away.
    const text = git(['grep', '-h', '-E', GIT_GREP_ERE, commit, '--'], { allowNoMatch: true });
    if (!text) continue;
    const batch = [];
    scanText(text, `history:${commit.slice(0, 8)}`, batch);
    for (const f of batch) {
      if (seen.has(f.fingerprint)) continue;
      seen.add(f.fingerprint);
      findings.push(f);
    }
  }
}

const workingTreeRisk = findings.filter((f) => f.usable && !f.where.startsWith('history:'));
const historyRisk = findings.filter((f) => f.usable && f.where.startsWith('history:'));

if (findings.length === 0) {
  console.log('No credential-shaped strings found.');
  process.exit(0);
}

for (const f of findings) {
  const status = f.usable
    ? 'USABLE'
    : !f.complete
      ? 'truncated'
      : f.kind === 'solana:base58-88'
        ? 'ambiguous'
        : 'public';
  console.log(`${status.padEnd(9)} ${f.kind.padEnd(22)} ${f.where}\n${' '.repeat(10)}${f.fingerprint} — ${f.detail}`);
}

console.log(
  `\n${findings.length} finding(s): ${workingTreeRisk.length} usable in working tree, ` +
    `${historyRisk.length} usable in history${HISTORY ? '' : ' (history not scanned — pass --history)'}.`
);

if (historyRisk.length > 0) {
  console.log('History hits cannot be removed by a commit. Rotate the credential; see docs/KEY-ROTATION.md.');
}

process.exit(workingTreeRisk.length > 0 ? 1 : 0);
