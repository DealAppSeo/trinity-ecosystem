#!/usr/bin/env node
//
// scan-secrets.mjs — find credentials in the working tree and, optionally, in
// git history. Reports what kind of credential each hit is and whether it is
// complete enough to use. Never prints a secret value.
//
//   node scripts/scan-secrets.mjs                    # working tree of the cwd repo
//   node scripts/scan-secrets.mjs --history          # + every commit reachable from any ref
//   node scripts/scan-secrets.mjs --root ../other    # scan a DIFFERENT repository
//   node scripts/scan-secrets.mjs --history --state .cache.json   # reuse prior commit results
//   node scripts/scan-secrets.mjs --history --since origin/main   # only commits in this range
//
// An unrecognised flag is a hard error. It used to be ignored: `--root` was not
// implemented, and passing it scanned the current directory instead and reported
// a clean result *for the wrong repository*, once per target. Eight repos were
// "scanned" that way and all eight results were this repo. A scanner that
// silently redefines its own target is the house defect in its purest form —
// success reported for work not done. See LESSONS D4.
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
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Argument parsing rejects what it does not understand. The previous version
// asked only `argv.includes('--history')`, which means every other token — a
// typo, a flag from a newer version, `--root` — was accepted and ignored.
const { HISTORY, ROOT, STATE, SINCE } = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  let history = false;
  let root = null;
  let state = null;
  let since = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--history') {
      history = true;
    } else if (arg === '--root') {
      root = argv[++i];
      if (!root || root.startsWith('--')) fail('--root requires a path argument');
    } else if (arg.startsWith('--root=')) {
      root = arg.slice('--root='.length);
      if (!root) fail('--root= requires a path argument');
    } else if (arg === '--state') {
      state = argv[++i];
      if (!state || state.startsWith('--')) fail('--state requires a path argument');
    } else if (arg.startsWith('--state=')) {
      state = arg.slice('--state='.length);
      if (!state) fail('--state= requires a path argument');
    } else if (arg === '--since') {
      since = argv[++i];
      if (!since || since.startsWith('--')) fail('--since requires a revision argument');
    } else if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length);
      if (!since) fail('--since= requires a revision argument');
    } else {
      fail(`unrecognised argument "${arg}"`);
    }
  }
  if (state && !history) fail('--state only has meaning with --history');
  if (since && !history) fail('--since only has meaning with --history');
  // The state file is rewritten from the set of commits scanned, which prunes
  // anything absent. Combining the two would therefore shrink a full-graph cache
  // down to whatever narrow range this run happened to look at, and every later
  // run would silently rescan from nearly nothing while reporting a cache hit.
  if (since && state) fail('--since cannot be combined with --state: it would prune the cache to the range');
  return { HISTORY: history, ROOT: root, STATE: state, SINCE: since };
}

function fail(message) {
  console.error(
    `scan-secrets: ${message}\n\n` +
      `usage: node scripts/scan-secrets.mjs [--history] [--root <path>] [--state <path>] [--since <rev>]\n\n` +
      `Refusing to run rather than scan a target you did not ask for.`
  );
  process.exit(2);
}

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
// `-C <root>` is applied here, in the single choke point every git call goes
// through, rather than at the call sites. A per-call-site opt-in is how you get
// a scanner that reads one repo's file list and another repo's blobs.
function git(args, { allowNoMatch = false } = {}) {
  const full = ROOT ? ['-C', ROOT, ...args] : args;
  try {
    return execFileSync('git', full, { encoding: 'utf8', maxBuffer: 1 << 28 });
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

// Scan the WORKING TREE, not HEAD, and include untracked files.
//
// This used to be `git ls-files` + `git show HEAD:<file>`, which reported clean
// on two things it had never read:
//
//   1. A new file that had not been `git add`ed yet — invisible to `ls-files`.
//   2. An uncommitted EDIT to a tracked file — `git show HEAD:<file>` returns the
//      COMMITTED blob, so a key added and not yet committed scanned clean.
//
// Both matter because this is the check you run BEFORE committing. It reported
// "No credential-shaped strings found" over an untracked file holding a prefixed
// opaque key literal, and CI — which sees the committed file — failed on it. A
// local gate that goes green on exactly the state a developer is in when they run
// it is the house defect in miniature. Found 2026-08-14; see LESSONS.
//
// Note this scans the scanner too, so prose here must not contain a
// credential-shaped token — the first version of this very comment tripped it.
//
// --exclude-standard honours .gitignore, so node_modules and .next stay out.
const listed = [
  ...git(['ls-files', '-z']).split('\0'),
  ...git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0'),
].filter(Boolean);

for (const file of [...new Set(listed)]) {
  // A lockfile carries integrity hashes that look like nothing else but produce
  // no useful signal here.
  if (file === 'package-lock.json' || file.endsWith('.pack')) continue;
  let buf;
  try {
    buf = readFileSync(join(repoRoot, file));
  } catch {
    // Tracked but deleted from the working tree, or an unreadable symlink.
    // Nothing on disk to scan; history mode still covers the committed copy.
    continue;
  }
  // Skip binary the way `grep -I` does: a NUL byte in the first 8KB.
  if (buf.subarray(0, 8192).includes(0)) continue;
  scanText(buf.toString('utf8'), file, findings);
}

// How many commits go into a single `git grep`. This used to spawn one git per
// commit; at 643 reachable commits that was 7m28s of a 9m19s CI job — 80% of the
// run, inside a step that by design cannot fail it. `git grep` accepts many
// tree-ish arguments at once, so the same search costs a handful of processes
// instead of one per commit. Batched rather than one giant call because both the
// argument list and git's per-rev working set grow with the batch.
const GREP_BATCH = 64;

// Bump when the on-disk shape of the state file changes.
const STATE_VERSION = 1;

// A cached per-commit result is only reusable if the rules that produced it have
// not changed. The key is a hash of this file, which holds every pattern and
// every heuristic: edit any of them and the whole cache is discarded rather than
// applying a widened rule only to commits that happen to be new. A cache that
// outlives the rule it was built from would report a clean history it never
// re-read under the current rules — the house defect wearing a performance hat.
function scanRulesFingerprint() {
  return createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 16);
}

// Returns commit -> findings for commits whose results can be reused. Every
// rejection path returns an empty map, which means a full scan: slower, never
// wrong. Silence is not one of the options — each reason prints.
function loadState(path, reachable) {
  const known = new Map();
  if (!path) return known;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    // ENOENT is the ordinary first run, not a fault worth shouting about.
    if (err.code !== 'ENOENT') {
      process.stderr.write(`state file unusable (${err.message}) — scanning every commit\n`);
    }
    return known;
  }
  if (parsed?.version !== STATE_VERSION || parsed?.rules !== scanRulesFingerprint()) {
    process.stderr.write('state file predates the current scan rules — scanning every commit\n');
    return known;
  }
  // Only reuse entries for commits that are still reachable. A deleted branch
  // has to drop out of the report, not linger because it was scanned once.
  const live = new Set(reachable);
  for (const [sha, hits] of Object.entries(parsed.commits ?? {})) {
    if (live.has(sha) && Array.isArray(hits)) known.set(sha, hits);
  }
  return known;
}

function saveState(path, reachable, byCommit) {
  if (!path) return;
  // Written from `reachable`, so commits that fell out of the graph are pruned
  // rather than accumulating forever.
  const commits = {};
  for (const sha of reachable) commits[sha] = byCommit.get(sha) ?? [];
  try {
    writeFileSync(path, JSON.stringify({ version: STATE_VERSION, rules: scanRulesFingerprint(), commits }));
  } catch (err) {
    // A cache that cannot be written makes the next scan slow, not wrong.
    process.stderr.write(`could not write state file (${err.message})\n`);
  }
}

// What the "usable in history" count actually covers. A range scan answers a
// narrower question than a full one and the summary has to say which: "0 usable
// in history" over three commits reads exactly like "0 usable in history" over
// the whole graph, and only one of them means the history is clean.
let historyScope = ' (history not scanned — pass --history)';

if (HISTORY) {
  // `--all` is every commit reachable from any ref — on a CI checkout with
  // fetch-depth: 0 that is every branch in the repo, so the cost tracks the whole
  // repo's commit count rather than this change's. `--since` narrows it to a
  // range, which is what the pull_request path wants: the commits under review
  // are the PR's own, and a cold full scan there is unbounded work for an answer
  // the main-branch run already produces.
  // Resolve --since before using it. Left to `rev-list`, an unresolvable
  // revision throws a raw stack trace and exits 1 — the same code as "usable
  // credential in the working tree" — and under the `|| true` this step runs
  // with in CI that renders as a scan that found nothing rather than a scan that
  // never ran. Exit 2 instead: refusing to run, distinct from every finding code.
  if (SINCE) {
    const resolved = git(['rev-parse', '--verify', '--quiet', `${SINCE}^{commit}`], {
      allowNoMatch: true,
    }).trim();
    if (!resolved) fail(`--since revision "${SINCE}" does not resolve to a commit in this repository`);
  }

  const commits = (
    SINCE ? git(['rev-list', `${SINCE}..HEAD`]) : git(['rev-list', '--all'])
  )
    .split('\n')
    .filter(Boolean);
  historyScope = SINCE
    ? ` (history: ${commits.length} commit(s) since ${SINCE} — NOT the full graph)`
    : '';

  // Findings per commit, for every commit reachable right now: reused where the
  // state file has them, freshly scanned where it does not. History is
  // append-only — an existing commit's content cannot change — so a commit
  // already searched under these same rules can never yield a different result.
  const byCommit = loadState(STATE, commits);
  const toScan = commits.filter((c) => !byCommit.has(c));
  process.stderr.write(
    `scanning ${commits.length} commits` +
      (SINCE ? ` since ${SINCE}` : '') +
      (STATE ? ` (${commits.length - toScan.length} reused, ${toScan.length} new)` : '') +
      '…\n'
  );

  for (let i = 0; i < toScan.length; i += GREP_BATCH) {
    const batch = toScan.slice(i, i + GREP_BATCH);
    // No `-h`: it strips the `<rev>:<path>` prefix, which is the only thing
    // saying WHICH commit a line came from — fine when the call was per-commit,
    // fatal now that one call spans many. `-z` terminates the filename with NUL
    // so a path containing a colon cannot be misparsed as line content.
    //
    // Whole matching lines, not `-o`. The assignment check above needs the text
    // *before* the match to tell a secret key from a transaction signature, and
    // `-o` throws that context away.
    const out = git(['grep', '-z', '-E', GIT_GREP_ERE, ...batch, '--'], { allowNoMatch: true });
    const lines = new Map();
    for (const record of out.split('\n')) {
      const nul = record.indexOf('\0');
      if (nul === -1) continue;
      const sha = record.slice(0, 40);
      if (!lines.has(sha)) lines.set(sha, []);
      lines.get(sha).push(record.slice(nul + 1));
    }
    // Record every commit in the batch, including the ones that matched
    // nothing. Storing only the hits would leave clean commits looking unscanned
    // and rescan them on every future run.
    for (const commit of batch) {
      const hits = [];
      const matched = lines.get(commit);
      if (matched?.length) scanText(matched.join('\n') + '\n', `history:${commit.slice(0, 8)}`, hits);
      byCommit.set(commit, hits);
    }
  }

  saveState(STATE, commits, byCommit);

  // Deduplicate history hits against EACH OTHER, but never against the working
  // tree. Seeding this set with the working-tree fingerprints — which is what it
  // used to do — makes a secret that is in both places report as working-tree
  // only, and prints "0 usable in history" over a secret that is in history.
  // The two demand different remedies: a working-tree hit is fixed by a commit,
  // a history hit only by rotation. Collapsing them recommends the wrong one.
  const seen = new Set();
  const workingTreeByFingerprint = new Map(
    findings.filter((f) => !f.where.startsWith('history:')).map((f) => [f.fingerprint, f])
  );
  // Walked in `rev-list` order, not scan order, so which commit gets the credit
  // for a secret present in many does not depend on what was cached.
  for (const commit of commits) {
    for (const f of byCommit.get(commit) ?? []) {
      if (seen.has(f.fingerprint)) continue;
      seen.add(f.fingerprint);
      // Present in the working tree too: annotate that finding rather than
      // listing the same secret twice, but record that history is implicated.
      const inTree = workingTreeByFingerprint.get(f.fingerprint);
      if (inTree) {
        inTree.alsoInHistory = f.where;
        continue;
      }
      findings.push(f);
    }
  }
}

const workingTreeRisk = findings.filter((f) => f.usable && !f.where.startsWith('history:'));
// A working-tree secret that is ALSO in history counts as a history risk, because
// removing it from the working tree does not remove it from history.
const historyRisk = findings.filter(
  (f) => f.usable && (f.where.startsWith('history:') || f.alsoInHistory)
);

if (findings.length === 0) {
  // Qualified only in range mode: a clean sweep of three commits is not the same
  // statement as a clean sweep of the graph, and this line is the one someone
  // quotes. Full-graph and working-tree-only output is unchanged.
  console.log(`No credential-shaped strings found.${SINCE ? historyScope : ''}`);
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
  const alsoIn = f.alsoInHistory ? ` (also in ${f.alsoInHistory})` : '';
  console.log(
    `${status.padEnd(9)} ${f.kind.padEnd(22)} ${f.where}${alsoIn}\n` +
      `${' '.repeat(10)}${f.fingerprint} — ${f.detail}`
  );
}

console.log(
  `\n${findings.length} finding(s): ${workingTreeRisk.length} usable in working tree, ` +
    `${historyRisk.length} usable in history${historyScope}.`
);

if (historyRisk.length > 0) {
  console.log('History hits cannot be removed by a commit. Rotate the credential; see docs/KEY-ROTATION.md.');
}

process.exit(workingTreeRisk.length > 0 ? 1 : 0);
