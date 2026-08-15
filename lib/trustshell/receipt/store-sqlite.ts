// lib/trustshell/receipt/store-sqlite.ts — local receipt storage.
//
// §12 Q1 answered: local SQLite first. Private by default, nothing to
// misconfigure, and no RLS policy to get wrong — this project already has two
// tables sitting at `USING (true)` for `anon` (LESSONS S1) and a live
// enterprise key readable from the browser bundle. A local file has none of
// that surface. Publishing to Supabase stays a separate, explicit step, so
// "recorded" and "published" cannot be confused.
//
// NO NEW DEPENDENCY. `node:sqlite` is built in — stable in Node 24, which is
// what CI runs, and experimental in Node 22. `better-sqlite3` would be a native
// module in a repo that currently has zero, for a table with five columns.
//
// AVAILABILITY IS A THREE-OUTCOME QUESTION, NOT A CRASH. On a runtime without
// `node:sqlite` the store reports unavailable and the caller records
// NOT_CHECKED. Receipt building, hashing, signing and verification are all pure
// and work everywhere; only persistence needs this.

import type { SessionReceipt } from './types';

export interface ReceiptStore {
  put(receipt: SessionReceipt): void;
  get(receiptId: string): SessionReceipt | null;
  getByAuditHash(auditHash: string): SessionReceipt | null;
  list(limit?: number): Array<{
    receiptId: string;
    sessionId: string | null;
    marker: string;
    endedAt: string | null;
  }>;
  close(): void;
}

export interface SqliteUnavailable {
  available: false;
  reason: string;
}

export type OpenResult = { available: true; store: ReceiptStore } | SqliteUnavailable;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trustshell_session_receipts (
  receipt_id     TEXT PRIMARY KEY,
  audit_hash     TEXT NOT NULL UNIQUE,
  session_id     TEXT,
  git_branch     TEXT,
  started_at     TEXT,
  ended_at       TEXT,
  marker         TEXT NOT NULL,
  attestation    TEXT NOT NULL,
  -- The full receipt, canonical. Kept whole rather than shredded into columns:
  -- auditHash covers the canonical form, so a column-per-field store would let
  -- a schema migration silently change what the hash was taken over.
  receipt_json   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_session ON trustshell_session_receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_receipts_ended ON trustshell_session_receipts(ended_at);
`;

/**
 * Open (and create) the receipt database.
 *
 * `path` defaults to the caller's choice deliberately — there is no implicit
 * `~/.trustshell/receipts.db` here, because a library that writes to a home
 * directory nobody named is a library that surprises someone. The CLI picks the
 * path and says so.
 */
export async function openReceiptStore(path: string): Promise<OpenResult> {
  let DatabaseSync: new (p: string) => SqliteDb;
  try {
    // Dynamic so a bundler or an older runtime does not fail at import time —
    // the pure half of this module tree must stay importable everywhere.
    const mod = (await import(/* webpackIgnore: true */ 'node:sqlite')) as {
      DatabaseSync: new (p: string) => SqliteDb;
    };
    DatabaseSync = mod.DatabaseSync;
  } catch (err) {
    return {
      available: false,
      reason:
        'node:sqlite is unavailable on this runtime ' +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        'Receipts can still be built, hashed, signed and verified; only persistence is off.',
    };
  }

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  return {
    available: true,
    store: {
      put(receipt) {
        const existing = db
          .prepare('SELECT audit_hash FROM trustshell_session_receipts WHERE receipt_id = ?')
          .get(receipt.receiptId) as { audit_hash?: string } | undefined;

        // receiptId is 80 truncated bits of auditHash. Same id with a different
        // hash is either a truncation collision or a bug upstream, and both must
        // be loud: silently overwriting would destroy one of two real receipts.
        if (existing?.audit_hash && existing.audit_hash !== receipt.auditHash) {
          throw new Error(
            `receiptId collision: ${receipt.receiptId} already stored with auditHash ` +
              `${existing.audit_hash}, refusing to overwrite with ${receipt.auditHash}. ` +
              'Compare the two receipts before deciding which is correct.'
          );
        }

        db.prepare(
          `INSERT INTO trustshell_session_receipts
             (receipt_id, audit_hash, session_id, git_branch, started_at, ended_at, marker, attestation, receipt_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(receipt_id) DO UPDATE SET
             marker = excluded.marker,
             attestation = excluded.attestation,
             receipt_json = excluded.receipt_json`
        ).run(
          receipt.receiptId,
          receipt.auditHash,
          receipt.core.sessionId,
          receipt.core.gitBranch,
          receipt.core.startedAt,
          receipt.core.endedAt,
          receipt.marker,
          receipt.attestation.kind,
          JSON.stringify(receipt)
        );
      },

      get(receiptId) {
        const row = db
          .prepare('SELECT receipt_json FROM trustshell_session_receipts WHERE receipt_id = ?')
          .get(receiptId) as { receipt_json?: string } | undefined;
        return row?.receipt_json ? (JSON.parse(row.receipt_json) as SessionReceipt) : null;
      },

      getByAuditHash(auditHash) {
        const row = db
          .prepare('SELECT receipt_json FROM trustshell_session_receipts WHERE audit_hash = ?')
          .get(auditHash) as { receipt_json?: string } | undefined;
        return row?.receipt_json ? (JSON.parse(row.receipt_json) as SessionReceipt) : null;
      },

      list(limit = 50) {
        const rows = db
          .prepare(
            `SELECT receipt_id, session_id, marker, ended_at
               FROM trustshell_session_receipts
              ORDER BY COALESCE(ended_at, '') DESC, receipt_id DESC
              LIMIT ?`
          )
          .all(limit) as Array<{
          receipt_id: string;
          session_id: string | null;
          marker: string;
          ended_at: string | null;
        }>;
        return rows.map((r) => ({
          receiptId: r.receipt_id,
          sessionId: r.session_id,
          marker: r.marker,
          endedAt: r.ended_at,
        }));
      },

      close() {
        db.close();
      },
    },
  };
}

// Minimal structural type for the bit of node:sqlite used here, so this file
// compiles on a @types/node that predates it.
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}
