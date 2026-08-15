#!/usr/bin/env node
//
// trustshell-receipt.mjs — emit a session receipt from a transcript.
//
//   node scripts/trustshell-receipt.mjs <session.jsonl> [--sign] [--store <db>]
//                                       [--git-reconcile] [--json]
//
// This is the impure edge of M2: it reads a file, hashes bytes, shells out to
// git, holds a key, and writes a database. Everything it calls in
// lib/trustshell/receipt is pure, which is what makes the receipt re-derivable
// by someone who has only the transcript.
//
// KEY CUSTODY. §12 Q2 is answered as per-developer local key, so `--sign` reads
// TRUSTSHELL_SIGNING_KEY (bs58 Ed25519 seed) and refuses to invent one. A key
// generated silently on first run would produce receipts signed by a key nobody
// backed up, and a self-attestation whose signer cannot be reproduced is worse
// than no signature — it looks like provenance and carries none.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--store'].includes(argv[i - 1]));

if (positional.length !== 1 || flag('--help')) {
  console.error(
    'usage: trustshell-receipt <session.jsonl> [--sign] [--store <db>] [--git-reconcile] [--claims] [--json]\n' +
      '\n' +
      '  --sign            self-attest with TRUSTSHELL_SIGNING_KEY (bs58 Ed25519 seed)\n' +
      '  --store <db>      persist to a local SQLite file\n' +
      '  --git-reconcile   compare files the transcript claims were written against git diff\n' +
      '  --claims          run T0 + T1 claim checking (T2 is not implemented)\n' +
      '  --json            print the receipt instead of the marker line\n'
  );
  process.exit(flag('--help') ? 0 : 2);
}

const transcriptPath = positional[0];

// Read once, hash the exact bytes, parse the same bytes. Hashing the file a
// second time would race a live session being appended to while it is read.
const bytes = readFileSync(transcriptPath);
const transcriptSha256 = createHash('sha256').update(bytes).digest('hex');

const outDir = mkdtempSync(join(process.cwd(), '.receipt-cli-'));
let receiptLib, didLib, parserLib, storeLib;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/receipt/index.ts',
      'lib/trustshell/receipt/store-sqlite.ts',
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/TranscriptParser.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell');
  receiptLib = await import(pathToFileURL(join(base, 'receipt', 'index.js')).href);
  didLib = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
  parserLib = await import(pathToFileURL(join(base, 'TranscriptParser.js')).href);
  storeLib = await import(pathToFileURL(join(base, 'receipt', 'store-sqlite.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error(`FAILED — receipt modules do not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

// Anything that goes wrong from here is recorded on the receipt rather than
// thrown away. §11: an internal error marks the receipt NOT_CHECKED, and a
// receipt that says why it is untrustworthy beats no receipt at all.
const internalErrors = [];

let parsed;
try {
  parsed = parserLib.parseTranscript(bytes.toString('utf8'), { sha256: transcriptSha256 });
} catch (err) {
  console.error(`FAILED — could not parse transcript: ${err instanceof Error ? err.message : err}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

if (parsed.census.malformedLines.length > 0) {
  internalErrors.push(`${parsed.census.malformedLines.length} malformed transcript lines`);
}
const unknownTypes = Object.keys(parsed.census.unknownRecordTypes);
if (unknownTypes.length > 0) {
  // §11's first named risk. An unknown record type means the parser's census
  // may be incomplete, so the receipt must not read as a full accounting.
  internalErrors.push(`unrecognised record types: ${unknownTypes.join(', ')}`);
}

// --- git context -----------------------------------------------------------

const gitIn = parsed.cwd ?? process.cwd();
const git = (args) => {
  const out = gitRaw(args);
  return out === null ? null : out.trim();
};

/**
 * Untrimmed. `git status --porcelain` puts the status in columns 1-2, so the
 * first record of the stream begins with a SPACE for an unstaged modification
 * (" M path"). Trimming the stream eats that space, shifts the first record by
 * one, and every path comes back missing its first character.
 *
 * That is not hypothetical — it shipped in this file's first draft and produced
 * exactly one wrong path out of eleven, which read as a genuine reconciliation
 * mismatch on a real session. A whitespace-significant format needs its own
 * accessor.
 */
const gitRaw = (args) => {
  try {
    return execFileSync('git', args, { cwd: gitIn, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return null;
  }
};

const gitHeadSha = git(['rev-parse', 'HEAD']);
let gitChangedFiles;
if (flag('--git-reconcile')) {
  // WHAT "CHANGED" HAS TO MEAN HERE, AND THE BUG THIS REPLACES.
  //
  // The first version of this asked `git diff --name-only HEAD`, which lists
  // unstaged edits to TRACKED files. Run against a real session it reported 13
  // mismatches out of 15 files — every one of them a file the agent genuinely
  // wrote, then either committed or created new. Committed files are not in
  // `diff HEAD`; brand-new files are not tracked, so they are not either.
  //
  // That is a false positive in the one check whose whole purpose is catching a
  // lie, and a reconciler that cries wolf is worse than no reconciler: it trains
  // people to ignore the marker. §11 names exactly this risk for T1 claims.
  //
  // The question that actually matches §4.1 is "what changed during this
  // session", which is the union of:
  //   - the working tree, including untracked files  (git status --porcelain -uall)
  //   - anything committed since the session started (git log --since)
  //
  // If the session start is unknown, the commit half cannot be bounded, so this
  // reports NOT_CHECKED instead of reconciling against a window it invented.
  const root = git(['rev-parse', '--show-toplevel']) ?? gitIn;
  const status = gitRaw(['status', '--porcelain', '-uall', '-z']);

  if (status === null) {
    internalErrors.push('--git-reconcile requested but git was unavailable');
  } else if (!parsed.startedAt) {
    internalErrors.push(
      '--git-reconcile requested but the transcript has no start time, so commits ' +
        'made during the session cannot be bounded'
    );
  } else {
    const changed = new Set();

    for (const rel of receiptLib.parsePorcelainZ(status)) changed.add(join(root, rel));

    const committed = git([
      'log',
      `--since=${parsed.startedAt}`,
      '--name-only',
      '--pretty=format:',
    ]);
    for (const rel of receiptLib.parseLogNameOnly(committed ?? '')) changed.add(join(root, rel));

    gitChangedFiles = [...changed];
  }
}

// --- build -----------------------------------------------------------------

const ruleset = {
  ...receiptLib.M2_RULESET,
  gitReconcile: flag('--git-reconcile') && gitChangedFiles !== undefined,
  claimsT0: flag('--claims'),
  claimsT1: flag('--claims'),
};

let receipt = await receiptLib.buildReceipt(parsed, {
  ruleset,
  gitHeadSha,
  gitChangedFiles,
  internalErrors,
});

// --- sign ------------------------------------------------------------------

if (flag('--sign')) {
  const seed = process.env.TRUSTSHELL_SIGNING_KEY;
  if (!seed) {
    console.error(
      'FAILED — --sign requires TRUSTSHELL_SIGNING_KEY (bs58 Ed25519 seed, 32 bytes).\n' +
        'Generate one and store it yourself:\n' +
        "  node -e \"import('bs58').then(async b=>{const k=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);" +
        "console.log(b.default.encode(new Uint8Array(await crypto.subtle.exportKey('pkcs8',k.privateKey)).slice(-32)))})\"\n" +
        '\n' +
        'No key is generated for you on purpose: a receipt signed by a key nobody kept\n' +
        'looks like provenance and carries none.'
    );
    rmSync(outDir, { recursive: true, force: true });
    process.exit(2);
  }
  try {
    receipt = await receiptLib.signReceipt(receipt, await didLib.keyPairFromSeed(seed), 'self');
  } catch (err) {
    console.error(`FAILED — could not sign: ${err instanceof Error ? err.message : err}`);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(1);
  }
}

// --- store -----------------------------------------------------------------

const dbPath = opt('--store');
let storeLine = null;
if (dbPath) {
  const opened = await storeLib.openReceiptStore(dbPath);
  if (!opened.available) {
    storeLine = `NOT CHECKED — not stored: ${opened.reason}`;
  } else {
    try {
      opened.store.put(receipt);
      storeLine = `stored → ${dbPath}`;
    } catch (err) {
      storeLine = `FAILED — not stored: ${err instanceof Error ? err.message : err}`;
    } finally {
      opened.store.close();
    }
  }
}

// --- report ----------------------------------------------------------------

const check = await receiptLib.checkReceipt(receipt);

if (flag('--json')) {
  console.log(JSON.stringify({ receipt, check }, null, 2));
} else {
  console.log(receiptLib.formatMarker(receipt, check));
  if (check.reasons.length > 0) {
    for (const r of check.reasons) console.log(`  · ${r}`);
  }
  if (receipt.core.internalErrors.length > 0) {
    for (const e of receipt.core.internalErrors) console.log(`  ! ${e}`);
  }
  if (storeLine) console.log(`  ${storeLine}`);
}

rmSync(outDir, { recursive: true, force: true });

// Exit code carries the marker so a Stop hook can branch on it. Note §7.3: a
// TrustShell crash must not fail the session, so the hook wrapper swallows
// this — the code is for humans and CI, not for gating the agent.
process.exit(check.outcome === 'FAILED' ? 1 : 0);
