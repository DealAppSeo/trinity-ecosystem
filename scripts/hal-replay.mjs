#!/usr/bin/env node
// scripts/hal-replay.mjs — mint compliance receipts for the historical HAL corpus.
//
// Run: node scripts/hal-replay.mjs [--dry-run] [--limit N] [--batch N] [--after ID]
//
// WHAT IT DOES. Walks `hal_classifications` in ascending id and mints one
// `receipt_kind = 'hal_classification'` row per classification, using the SAME
// preimage and row builders the live writer uses — `halReceiptAuditPreimage`
// and `halReceiptRow` are imported, not reimplemented, so a replayed receipt
// and a live one are byte-identical for identical input.
//
// ── WHY THIS IS SAFE TO RUN TWICE, AND WHY THAT CUTS BOTH WAYS ───────────────
//
// `kya_receipts_hal_classification_uniq` is a partial unique index on
// `hal_classification_id`. A second pass raises 23505 per already-minted row
// and mints nothing. That is what makes a 147,704-row job resumable at all: it
// WILL be interrupted, and a resume that double-mints would silently inflate
// the corpus and every rate later computed from it.
//
// The same index makes a wrong first pass permanent. `audit_hash` is NULLABLE,
// so a run without a secret would write receipts nobody can verify, and
// idempotency would then refuse to replace them. Recovery would be a mass
// delete of production receipts. So this script REFUSES to start without
// `TRUSTRAILS_HMAC_SECRET` rather than degrading — see `assertMintable`.
//
// ── WHY IT STOPS ON THE FIRST REAL ERROR ─────────────────────────────────────
//
// Anything that is not 23505 halts the run and prints the cursor. A replay that
// logs failures and keeps going leaves a corpus that is partly minted with no
// record of which rows are missing, and prints a completion line at the end.
// That is the defect this whole repo is built against. Stopping loudly with a
// resumable cursor is strictly better than finishing dishonestly.
//
// ── WHAT IT DOES NOT CLAIM ───────────────────────────────────────────────────
//
// A minted receipt records that a classification HAPPENED and pins its fields
// under an audit hash. It does not assert the classification was CORRECT, that
// a BFT panel voted (`bft_passed` is NULL, not false), or that KYA ran
// (`kya_verified` is false). Those are set by `halReceiptRow`, and the shape
// constraint fails the insert loudly if a future edit tries to claim otherwise.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(arg('--limit', Infinity));
const AFTER = Number(arg('--after', 0));

// ── compile the shared modules ──────────────────────────────────────────────
// All three are zero-import by design, which is what lets a script reuse the
// production builders without dragging in the `@/` alias and a Next runtime.
const outDir = mkdtempSync(join(ROOT, '.hal-replay-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let plan, halReceipt, receiptAudit;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/replay/plan.ts', 'lib/trustshell/hal-receipt.ts',
     'lib/trustshell/receipt-audit.ts',
     '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  const at = (p) => pathToFileURL(join(outDir, 'trustshell', p)).href;
  plan = await import(at('replay/plan.js'));
  halReceipt = await import(at('hal-receipt.js'));
  receiptAudit = await import(at('receipt-audit.js'));
} catch (err) {
  console.error(`FAILED — shared modules do not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

const { classifyInsert, advance, clampBatch, verdictOf, summarize } = plan;
const { halReceiptAuditPreimage, halReceiptRow } = halReceipt;
const { requireAuditSecret } = receiptAudit;

const BATCH = clampBatch(Number(arg('--batch', 250)));

// ── preconditions, checked before a single row is read ──────────────────────
//
// Both are fatal and both name the variable. A run that discovers a missing
// credential 40,000 rows in has already spent the time.
//
// `requireAuditSecret` is called DIRECTLY and is the only secret policy in
// play. An earlier draft put a softer preflight in `replay/plan.ts` so the
// refusal could be unit-asserted without env; it checked only for empty, and so
// would have waved through every short or abandoned-default secret this
// function exists to reject — a weaker second opinion running first. See the
// note in plan.ts.
try {
  requireAuditSecret(process.env);
} catch (err) {
  console.error(`REFUSING TO REPLAY: ${err.message}`);
  console.error(
    '\nThis matters more here than on the live path. `audit_hash` is NULLABLE and\n' +
      '`kya_receipts_hal_classification_uniq` is a partial UNIQUE index, so a run\n' +
      'under a bad secret writes 147,704 receipts that cannot be verified AND that\n' +
      'idempotency will then refuse to let you re-mint. Recovery is a mass delete\n' +
      'of production receipts.'
  );
  process.exit(1);
}
const SECRET = requireAuditSecret(process.env);

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'REFUSING TO REPLAY: no database credentials.\n' +
      'Set SUPABASE_URL and SUPABASE_SECRET_KEY (an `sb_secret_…` key, which\n' +
      'resolves to the service_role Postgres role).'
  );
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** The one line not reused from ComplianceReceipt.ts, which imports the `@/` alias. */
const auditHmac = (preimage) => createHmac('sha256', SECRET).update(preimage).digest('hex');

const counts = { minted: 0, skipped: 0, failed: 0, remaining: 0 };
let cursor = { afterId: Number.isFinite(AFTER) ? AFTER : 0 };
let attempted = 0;
let fatal = null;

console.log(
  `hal-replay — batch ${BATCH}, starting after id ${cursor.afterId}` +
    (DRY_RUN ? ', DRY RUN (no writes)' : '') +
    (Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : '')
);

while (attempted < LIMIT && !fatal) {
  const take = Math.min(BATCH, LIMIT - attempted);
  const { data: rows, error: readError } = await db
    .from('hal_classifications')
    .select('id, prompt_hash, category, confidence, provider, model, previous_entry_hash')
    .gt('id', cursor.afterId)
    .order('id', { ascending: true })
    .limit(take);

  if (readError) {
    fatal = `read failed after id ${cursor.afterId}: ${readError.message}`;
    break;
  }
  if (!rows || rows.length === 0) break;

  const ids = [];
  for (const row of rows) {
    ids.push(row.id);
    attempted += 1;

    const receiptId = crypto.randomUUID();
    const hash = auditHmac(halReceiptAuditPreimage(row, receiptId));

    if (DRY_RUN) {
      counts.minted += 1;
      continue;
    }

    const { error } = await db
      .from('kya_compliance_receipts')
      .insert(halReceiptRow(row, receiptId, hash));

    const outcome = classifyInsert(error);
    if (outcome === 'minted') counts.minted += 1;
    else if (outcome === 'duplicate') counts.skipped += 1;
    else {
      counts.failed += 1;
      fatal =
        `insert failed on hal_classification ${row.id} ` +
        `(${error?.code ?? 'no code'}): ${error?.message ?? 'no message'}`;
      break;
    }
  }

  cursor = advance(cursor, ids);
  console.log(
    `  … through id ${cursor.afterId} — minted ${counts.minted}, present ${counts.skipped}`
  );
}

// Rows beyond the cursor that this run never attempted. Counted, not assumed
// zero: it is what turns an interrupted run into NOT_CHECKED instead of a
// green line over a partly-minted corpus.
const { count: totalRemaining, error: countError } = await db
  .from('hal_classifications')
  .select('id', { count: 'exact', head: true })
  .gt('id', cursor.afterId);

if (countError) {
  console.error(`\nWARNING — could not count remaining rows: ${countError.message}`);
  console.error('The verdict below therefore cannot distinguish complete from interrupted.');
  counts.remaining = 0;
} else {
  counts.remaining = totalRemaining ?? 0;
}

if (fatal) {
  console.error(`\nSTOPPED: ${fatal}`);
  console.error(`Resume with:  node scripts/hal-replay.mjs --after ${cursor.afterId}`);
}

console.log(`\nhal-replay — ${summarize(counts)}`);
if (DRY_RUN) {
  console.log(
    'DRY RUN: preimages and audit hashes were computed, nothing was written.\n' +
      'The "minted" count above is what WOULD have been attempted.'
  );
}

// 0 VERIFIED, 2 NOT_CHECKED, 1 FAILED — the repo's exit-code contract.
const verdict = verdictOf(counts);
process.exit(verdict === 'VERIFIED' ? 0 : verdict === 'NOT_CHECKED' ? 2 : 1);
