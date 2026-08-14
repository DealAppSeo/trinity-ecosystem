// lib/trustshell/identity/nonce-store.ts
//
// Replay defence for control proofs. A signed proof stays valid for its whole
// window, so without spent-nonce state anyone who observes one can present it
// again until it expires — and every signature check still passes, because
// nothing about the proof is wrong. It has simply been used before.
//
// THE OPERATION IS ATOMIC CHECK-AND-RECORD, NOT CHECK-THEN-RECORD.
//
// This is the whole design. A `has()` followed by an `add()` has a window
// between the two calls, and two concurrent presentations of the same proof
// both read "unseen" and both proceed. That is precisely the request an attacker
// sends twice. So the interface exposes exactly one method — `consume` — which
// returns whether the caller is the first to claim the nonce. There is no `has`,
// deliberately: an interface that offers a read-only check invites the racy
// pattern, and a nonce store that loses the race is decoration.
//
// The Postgres implementation gets atomicity from a primary key: the insert
// either succeeds or violates the constraint. No transaction, no lock, no
// read-modify-write.

/** Scoped by audience: the same nonce under two audiences is two nonces. */
export interface NonceStore {
  /**
   * Atomically claim `nonce` for `audience`.
   *
   * @returns true if this caller is the first to claim it (proceed),
   *          false if it was already spent (reject as a replay).
   */
  consume(nonce: string, audience: string, expiresAt: Date): Promise<boolean>;
}

/**
 * Process-local store. Correct for a single process, and correct for tests.
 *
 * NOT correct across instances: two serverless invocations do not share this
 * map, so a proof replayed against a different instance is not caught. Named
 * loudly rather than presented as a general implementation — the failure is
 * invisible in dev, where there is one process, and total in production, where
 * there are many.
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly spent = new Map<string, number>();

  async consume(nonce: string, audience: string, expiresAt: Date): Promise<boolean> {
    this.prune();
    const key = `${audience}\u001f${nonce}`;
    // Map.set after Map.has is safe here only because JS is single-threaded
    // within a process; there is no await between the two.
    if (this.spent.has(key)) return false;
    this.spent.set(key, expiresAt.getTime());
    return true;
  }

  /** Entries are only useful until the proof expires; keep the map bounded. */
  private prune(now = Date.now()): void {
    for (const [k, exp] of this.spent) if (exp <= now) this.spent.delete(k);
  }

  get size(): number {
    this.prune();
    return this.spent.size;
  }
}

/**
 * Durable store, shared across instances.
 *
 * Requires `supabase/migrations/20260814090000_control_proof_nonces.sql`, which
 * is written but deliberately UNAPPLIED — applying a migration to the live
 * project is Sean-gated. Until it is applied this class throws on first use
 * rather than silently failing open, because a replay check that quietly
 * returns true is worse than no replay check: it reports a defence that is not
 * there. Same reasoning as SupabaseReputationStore refusing to load without its
 * migration.
 */
export class SupabaseNonceStore implements NonceStore {
  constructor(
    // Injected so this module never imports supabase-admin at module scope —
    // `next build` imports every route module, and a client built at import
    // time fails the build when a key is absent (lib/CLAUDE.md).
    private readonly getClient: () => {
      from: (t: string) => {
        insert: (r: unknown) => Promise<{ error: { code?: string; message: string } | null }>;
      };
    }
  ) {}

  async consume(nonce: string, audience: string, expiresAt: Date): Promise<boolean> {
    const { error } = await this.getClient()
      .from('control_proof_nonces')
      .insert({ nonce, audience, expires_at: expiresAt.toISOString() });

    if (!error) return true;

    // 23505 = unique_violation. The nonce was already spent, which is a normal
    // outcome and the entire point of the primary key.
    if (error.code === '23505') return false;

    // Anything else — table missing, permissions, connectivity — must NOT be
    // read as "unseen". Failing closed turns an outage into rejected requests;
    // failing open turns it into accepted replays.
    throw new Error(
      `nonce store unavailable, refusing to assume this proof is unspent: ${error.message}`
    );
  }
}
