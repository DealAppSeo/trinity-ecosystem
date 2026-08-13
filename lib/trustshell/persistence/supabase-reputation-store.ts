// lib/trustshell/persistence/supabase-reputation-store.ts
//
// Postgres implementation of the harness's `ReputationStore`, against Trinity's
// `agent_repid` table.
//
// IT LIVES OUTSIDE `lib/trustshell/harness/` ON PURPOSE. That directory is
// enforced dependency-free by `npm run check:harness-portable`, so the
// interface is declared inside it and every implementation binds to a database
// out here. The harness stays a package other trust systems can adopt; this
// file is the part that is specific to Trinity's schema.
//
// SCHEMA FACTS, VERIFIED BY QUERY ON 2026-08-13 rather than assumed:
//
//   - primary key is `agent_name` (single text column), so upsert has a
//     natural conflict target.
//   - `earned_score` is an integer whose live range across 87 rows is 0..10000
//     — the SAME basis-point scale the harness uses. No conversion, and this
//     was checked rather than inferred, because a silent 10x scale mismatch
//     here would corrupt every ranking downstream.
//   - RLS is enabled. `service_role` holds ALL; `authenticated` holds SELECT
//     only. Writes therefore require the admin client, which is why this file
//     uses `getSupabaseAdmin()`.
//
// THE PROBLEM THIS FILE CANNOT SOLVE ON ITS OWN. `agent_repid` has **no
// observation-count column**. The ledger's whole design is
// `confidence = n / (n + k)`, so a record restored without `n` has confidence
// 0 and its `earnedScore` collapses to the prior — every track record in the
// fleet erased, by a load that looked like it worked. There is no honest way
// to synthesise `n`: `total_challenges_made` counts a different thing, and
// defaulting to 0 is precisely the silent-erasure case.
//
// So this store REFUSES TO RUN until the column exists. The migration is
// written and NOT applied: `supabase/migrations/20260813210000_agent_repid_earned_observations.sql`.
// Applying it is Sean's call.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { ReputationRecord, ReputationStore } from '@/lib/trustshell/harness/reputation';

const TABLE = 'agent_repid';
const ID_COLUMN = 'agent_name';
const SCORE_COLUMN = 'earned_score';
const OBSERVATIONS_COLUMN = 'earned_observations';
const UPDATED_COLUMN = 'last_earned_update';

const MIGRATION_PATH =
  'supabase/migrations/20260813210000_agent_repid_earned_observations.sql';

/**
 * Thrown when `agent_repid.earned_observations` does not exist.
 *
 * A named error rather than a generic one, because the fix is specific and
 * unguessable from a PostgREST message: apply the migration. Callers that
 * catch this can degrade to an in-memory ledger deliberately; callers that do
 * not will fail loudly, which is the correct default.
 */
export class MissingObservationsColumnError extends Error {
  constructor(detail: string) {
    super(
      `${TABLE}.${OBSERVATIONS_COLUMN} does not exist, so reputation confidence cannot be ` +
        `persisted or restored. Loading without it would set every expert's observation count ` +
        `to 0, collapsing every earned score to the prior — a silent erasure of the whole ` +
        `fleet's track record. Apply ${MIGRATION_PATH} first. Underlying error: ${detail}`
    );
    this.name = 'MissingObservationsColumnError';
    Object.setPrototypeOf(this, MissingObservationsColumnError.prototype);
  }
}

/** Postgres error code for "column does not exist". */
const UNDEFINED_COLUMN = '42703';

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  return (error.message ?? '').includes(OBSERVATIONS_COLUMN);
}

export class SupabaseReputationStore implements ReputationStore {
  /**
   * Getter, never a field.
   *
   * A class field initialiser runs when the class is instantiated, and if that
   * happens at module scope it runs at BUILD time with no runtime environment.
   * That exact pattern broke every deployment of this project from 2026-06-05
   * to 2026-08-11; see lib/CLAUDE.md.
   */
  private get db() {
    return getSupabaseAdmin();
  }

  async load(): Promise<ReputationRecord[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select(`${ID_COLUMN}, ${SCORE_COLUMN}, ${OBSERVATIONS_COLUMN}`);

    if (error) {
      if (isMissingColumn(error)) throw new MissingObservationsColumnError(error.message);
      throw new Error(`Failed to load reputation from ${TABLE}: ${error.message}`);
    }
    // `data` null with no error would be indistinguishable from an empty fleet,
    // and an empty load followed by a save wipes the table. Treat it as broken.
    if (data === null) {
      throw new Error(
        `Loading ${TABLE} returned neither rows nor an error. Refusing to report this as an ` +
          `empty ledger, because an empty load followed by a save would erase every row.`
      );
    }

    const records: ReputationRecord[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const id = row[ID_COLUMN];
      if (typeof id !== 'string' || id.length === 0) continue;

      const score = row[SCORE_COLUMN];
      const observations = row[OBSERVATIONS_COLUMN];

      // A row that has never been scored carries nulls. Skipping it is right:
      // the ledger treats an absent id as "no observations", which is exactly
      // what it is. Coercing null to 0 would instead assert a measurement.
      if (score === null || observations === null) continue;
      if (typeof score !== 'number' || typeof observations !== 'number') continue;
      if (!Number.isFinite(score) || !Number.isInteger(observations) || observations < 0) continue;

      records.push({ id, observedScore: score, observations });
    }
    return records;
  }

  async save(records: readonly ReputationRecord[]): Promise<void> {
    if (records.length === 0) return;

    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      [ID_COLUMN]: r.id,
      // Rounded, because the column is an integer. This is the one lossy step
      // in the round trip: the in-memory EWMA is a float. Over repeated
      // save/load cycles the score drifts by at most half a basis point per
      // cycle, which is below the resolution anything downstream uses.
      [SCORE_COLUMN]: Math.round(r.observedScore),
      [OBSERVATIONS_COLUMN]: r.observations,
      [UPDATED_COLUMN]: now,
    }));

    // NOTE: `perceived_score` is deliberately never written here. The ledger
    // holds only earned outcomes — self-report cannot reach a ranking, so it
    // has nothing to say about the perceived column and must not overwrite
    // whatever else maintains it.
    const { error } = await this.db.from(TABLE).upsert(rows, { onConflict: ID_COLUMN });

    if (error) {
      if (isMissingColumn(error)) throw new MissingObservationsColumnError(error.message);
      throw new Error(`Failed to save reputation to ${TABLE}: ${error.message}`);
    }
  }
}
