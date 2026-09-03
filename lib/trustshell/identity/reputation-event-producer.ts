// lib/trustshell/identity/reputation-event-producer.ts — the missing producer.
//
// Stage B of the agent loop (docs/AGENT-LOOP-SCOPE.md): outcomes become
// reputation events. `reputation-transition.ts` has had the whole append-only,
// nullifier-scoped, membership-checked transition machinery for weeks — and NO
// producer. The chain the system is premised on —
//
//   outcome -> committed event -> read-time score -> routing weight
//
// was broken at exactly one link: nothing turned an outcome into a committed
// event. This is that link, promoted from the hand-assembly in
// `scripts/check-identity.mjs` into shipped, reachable code (the same move
// `spine.ts` made for the spine's own end-to-end plumbing).
//
// ── THE THREE RATIFIED DECISIONS, ENCODED ────────────────────────────────────
//
//   1. THE WRITER IS THE VERDICT PATH, NEVER THE DOER. A loop cannot write its
//      own outcomes — that is self-report, the exact thing a reputation layer
//      replaces (reputation-transition.ts header; LESSONS A11). The events come
//      from `reputationForVerdict` (outcome-to-reputation.ts), which emits only
//      about the drawn, independent CHECKER and NEVER about the doer. This
//      producer enforces the second half as a hard guard: `doerDid` is required
//      and an event that targets it is REFUSED — a reputation event about the
//      doer arriving through the verdict path is a self-report wearing a verdict.
//   2. THE EPOCH IS THE VERIFIED TASK. `epoch` binds into the nullifier scope,
//      and a nullifier spends once — so one authorization appends to a subject's
//      history exactly once per task. The caller passes `assignment.taskId`.
//   3. THE HEAD ROOT IS HELD BY THE VERIFIER. `prevRoot` must be the current head
//      the verifier holds, not one the prover chose (TRANSITION_CONTRACT
//      .mustAlsoHold). This producer reads and advances the head through an
//      injected `HeadRootStore` INTERFACE — the durable, conditional
//      (`advance ... where root = prev`) implementation is the verifier's and is
//      DEFERRED (needs a migration + service_role; see the PR).
//
// ── WHAT THIS DOES NOT DO, AND REFUSES TO FAKE (the honest ceiling) ──────────
//
//   * The SPENT SET is the verifier's durable job and is NOT here. This producer
//     emits a nullifier per append; a durable spent set must reject a reused one.
//     The test proves WHY: two events under one (subject, epoch) derive the SAME
//     nullifier, so without a spent set the second append is unbounded.
//   * REAL Poseidon2 is fenced. `PendingPoseidon2Scheme` THROWS (its parameters'
//     encoding is unsettled — nullifier.ts MISSING_PARAMETERS). This producer
//     does not default a scheme; a caller injects one. Under a stand-in scheme
//     `parametersKnown` is false, and that flag rides on every result so a
//     durable store can REFUSE to persist a root computed under a stand-in —
//     build the seam, refuse to fake the thing behind it.
//   * `observedAt` is asserted, not proven (TRANSITION_CONTRACT.observedAtIsAsserted).
//   * VALUE CEILING: the fleet has been idle since 2026-07-17, so a correct
//     producer emits nothing today because no verified work is flowing. This
//     ships the mechanism; it does not claim to be producing reputation.
//
// Portable: imports only from `./reputation-transition` and `./nullifier`. No
// Supabase, no I/O — every external thing (the scheme, the head store) is injected.

import {
  commitEvent,
  appendEvent,
  scopeForSubject,
  verifyTransitionByRecomputation,
  GENESIS_ROOT,
  type ReputationEvent,
  type TransitionStatement,
  type TransitionVerification,
} from './reputation-transition';
import type { IBindingScheme, MembershipStep } from './nullifier';

/**
 * The authority to append to reputation history: a member of the group the
 * verifier trusts to write it. The appender's identity commitment is DERIVED
 * (`scheme.commit(secret)`), never passed, so it cannot disagree with the secret
 * the nullifier is computed from.
 */
export interface WriterBinding {
  /** The appender's secret. Ties the nullifier to a specific group member. Private. */
  readonly secret: string;
  /** Root of the group authorized to write reputation history — the verifier's trusted anchor. */
  readonly groupRoot: string;
  /** Path proving the appender's commitment sits under `groupRoot`. */
  readonly membership: MembershipStep[];
  /** The domain the write authorization is scoped to. */
  readonly domain: string;
}

/**
 * Where the current history head lives. Read + advance only — no rewrite.
 *
 * The DURABLE implementation must make `advance` conditional (compare-and-set on
 * the stored root) so two provers cannot both extend the same head; this
 * interface is the seam, and an in-memory implementation is fine for tests. A
 * store that returns a falsy head is treated as the empty history (GENESIS_ROOT).
 */
export interface HeadRootStore {
  headFor(subject: string): Promise<string>;
  /** Advance `subject`'s head from `prevRoot` to `newRoot`. Durable impls make this compare-and-set. */
  advance(subject: string, prevRoot: string, newRoot: string): Promise<void>;
}

export interface ProduceTransitionsInput {
  /** The events to append — from `reputationForVerdict(...).events`. Usually empty; that is normal. */
  readonly events: readonly ReputationEvent[];
  /** The authorized appender — the verdict-path member. NEVER the doer. */
  readonly writer: WriterBinding;
  /** The binding scheme. A pending scheme THROWS rather than faking a root. */
  readonly scheme: IBindingScheme;
  /** The verifier-held history head. */
  readonly headRootStore: HeadRootStore;
  /** The write budget — one append per (subject, epoch). The verified task id. */
  readonly epoch: string;
  /** The actor whose work was judged. NO event may target it via this path (no self-report). */
  readonly doerDid: string;
}

export interface ProducedTransition {
  readonly subject: string;
  readonly statement: TransitionStatement;
  readonly newRoot: string;
  readonly nullifier: string;
  /** Honest-prover recomputation of the statement — valid iff the sequence checks out. */
  readonly verification: TransitionVerification;
  /**
   * Whether the scheme's parameters are settled. FALSE means the root was
   * computed under a stand-in — a durable store MUST refuse to persist it.
   */
  readonly parametersKnown: boolean;
}

/**
 * Turn reputation events into appended, self-checked history transitions.
 *
 * One transition per event: commit the event, read the subject's head, append,
 * nullify under the (subject, epoch) scope, assemble the statement, recompute it,
 * and — only when it checks out — advance the head. Returns every transition with
 * its verification, so a caller can persist the valid ones and see the rest.
 */
export async function produceTransitions(input: ProduceTransitionsInput): Promise<ProducedTransition[]> {
  const { events, writer, scheme, headRootStore, epoch, doerDid } = input;

  // No self-report through the verdict path. Checked before any crypto runs so a
  // refusal is unambiguous and cheap.
  for (const e of events) {
    if (e.subject === doerDid) {
      throw new Error(
        `refusing to append a reputation event about the doer ('${doerDid}') through the verdict ` +
          'path: an outcome about the actor whose work was judged is a self-report, which is the ' +
          'exact thing an earned-reputation layer replaces. The verdict path earns the CHECKER, ' +
          'never the doer (outcome-to-reputation.ts).'
      );
    }
  }

  if (events.length === 0) return [];

  // Derived, never passed — so it cannot disagree with the nullifier's secret.
  const appenderCommitment = await scheme.commit(writer.secret);
  const out: ProducedTransition[] = [];

  for (const event of events) {
    const scope = scopeForSubject(event.subject, epoch);
    const eventCommitment = await commitEvent(event, scheme);
    const prevRoot = (await headRootStore.headFor(event.subject)) || GENESIS_ROOT;
    const newRoot = await appendEvent(prevRoot, eventCommitment, scheme);
    const nullifier = await scheme.nullify(writer.secret, writer.domain, scope);

    const statement: TransitionStatement = {
      publicInputs: { prevRoot, newRoot, nullifier, domain: writer.domain, scope, groupRoot: writer.groupRoot },
      privateWitness: { event, eventCommitment, secret: writer.secret, appenderCommitment, membership: writer.membership },
    };

    const verification = await verifyTransitionByRecomputation(statement, scheme);
    // Advance only a transition that checks out. A durable store makes this a
    // compare-and-set; the spent-set (the OTHER half of safety) is the verifier's
    // and is not here — see the header.
    if (verification.valid) {
      await headRootStore.advance(event.subject, prevRoot, newRoot);
    }

    out.push({ subject: event.subject, statement, newRoot, nullifier, verification, parametersKnown: scheme.parametersKnown });
  }

  return out;
}

/**
 * The reference in-memory head store. Enough to drive the producer offline; the
 * durable, compare-and-set store is the deferred verifier-side piece.
 */
export class InMemoryHeadRootStore implements HeadRootStore {
  private readonly heads = new Map<string, string>();
  async headFor(subject: string): Promise<string> {
    return this.heads.get(subject) ?? GENESIS_ROOT;
  }
  async advance(subject: string, _prevRoot: string, newRoot: string): Promise<void> {
    this.heads.set(subject, newRoot);
  }
}
