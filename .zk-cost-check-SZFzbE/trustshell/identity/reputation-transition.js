"use strict";
// lib/trustshell/identity/reputation-transition.ts
//
// Reputation as a constrained transition over an append-only history, rather
// than a number in a mutable column.
//
// WHY THIS IS THE IDEA WORTH BUILDING. `agent_kya_registry.human_custody_verified`
// is `true` for five agents with nothing behind it (LESSONS A11). RepID was four
// literals until it was measured. Both are the same failure: a value that can be
// *written* rather than *earned*. If a score can only change through a transition
// a circuit constrains, forging it means forging history — and history is
// append-only and committed.
//
// ── THE BOUNDARY, STATED BEFORE ANYTHING ELSE ────────────────────────────────
//
// The circuit proves the EVENT SEQUENCE. It does not prove the score.
//
//   IN circuit    each event is well-formed, appended by a member of the group
//                 authorized to write THIS subject's history, and chained onto
//                 the previous root — nothing inserted, reordered, or removed.
//   OUT of circuit  the score itself: EarnedMetrics' 30-day exponential decay
//                 and empirical-Bayes shrinkage, applied at READ time with the
//                 current clock as an input.
//
// This split is forced, not chosen. Decay is time-dependent: a score changes
// with no new events, so there is no leaf at the moment of decay for a circuit
// to constrain. Putting it in-circuit would require a trusted clock inside the
// proof, which is a genuinely hard and separate problem. Pretending otherwise
// would be exactly the overclaim this file exists to prevent.
//
// So the honest claim is: **"these events happened, in this order, appended by
// authorized members, and none were inserted or removed"** — not "the score is
// 3723". The score is a pure function of a proven sequence plus a public
// timestamp, which is strictly stronger than today (a number in a table) and
// weaker than "proven score", which nobody has.
//
// ── WHAT AN EVENT IS ─────────────────────────────────────────────────────────
//
// Deliberately minimal. An event records that something reputation-affecting
// occurred, with enough structure to score it later and no more. Rich payloads
// belong in memory, behind access control (memory-authz.ts) — putting them here
// would make the history both bigger and more sensitive for no gain.
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDENTITY_TAGS = exports.READ_TIME_SCORING = exports.TRANSITION_CONTRACT = exports.GENESIS_ROOT = exports.TRANSITION_TAG = exports.REPUTATION_SIGNALS = void 0;
exports.commitEvent = commitEvent;
exports.scopeForSubject = scopeForSubject;
exports.appendEvent = appendEvent;
exports.verifyTransitionByRecomputation = verifyTransitionByRecomputation;
const nullifier_1 = require("./nullifier");
/**
 * The same list at runtime.
 *
 * A union type is erased at the boundary — an event arriving over HTTP is
 * `any` no matter what the signature says. A history that accepts an unknown
 * signal commits to it, and every later reader has to decide what an
 * unrecognised leaf means. Closed here instead.
 */
exports.REPUTATION_SIGNALS = [
    'bft_vote_correct',
    'bft_vote_incorrect',
    'veritas_catch',
    'veritas_miss',
    'x402_settled',
    'x402_failed',
    'latency_sample',
];
exports.TRANSITION_TAG = 'zkrepid:reputation-event:v1';
/**
 * Field separator for the canonical event encoding.
 *
 * U+001F (unit separator), matching disclosure.ts and nonce-store.ts. Written
 * as an escape, never as a raw byte — four raw NUL bytes once sat in this
 * repo's wire formats, invisible in every diff and every review, and the
 * interop spec handed to the other lane was wrong because of it.
 */
const FIELD_SEP = '\u001f';
/**
 * Reject a field that could forge a different event with the same encoding.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT PARANOIA. The first draft joined the fields
 * with `''`. That is not a canonical encoding, it is a concatenation, and it
 * collides: `{value: 1, observedAt: '2026-…'}` and `{value: 12, observedAt:
 * '026-…'}` produce the identical string, so one commitment reopens to two
 * different events and the "which event was committed" question has two
 * answers. A separator fixes that only if the separator cannot appear inside a
 * field — otherwise the same attack returns one level down.
 */
function assertEncodable(field, name) {
    if (field.includes(FIELD_SEP)) {
        throw new Error(`${name} contains the field separator (U+001F), which would make two ` +
            'different events share one encoding. Reject rather than escape: an ' +
            'escaping rule is a second thing both lanes must implement identically.');
    }
}
/**
 * Commit to an event. The commitment is what enters the history chain.
 *
 * Canonically encoded field by field with an explicit separator — key order is
 * not guaranteed across a JSON round trip, and a history whose leaves depend on
 * serialization order would fork between implementations.
 */
async function commitEvent(event, scheme) {
    if (!event.subject)
        throw new Error('subject is required — an event about nobody scores nothing');
    if (!exports.REPUTATION_SIGNALS.includes(event.signal)) {
        throw new Error(`unknown signal '${event.signal}'. The set is closed: an unrecognised leaf ` +
            'in an append-only history can never be removed and every later reader ' +
            'has to guess what it meant.');
    }
    if (!event.observedAt)
        throw new Error('observedAt is required — read-time decay has nothing to work with without it');
    const fields = [
        exports.TRANSITION_TAG,
        event.subject,
        event.signal,
        event.value === undefined ? '' : String(event.value),
        event.observedAt,
    ];
    assertEncodable(event.subject, 'subject');
    assertEncodable(event.observedAt, 'observedAt');
    return scheme.commit(fields.join(FIELD_SEP));
}
/**
 * The scope a write authorization is spent under.
 *
 * BINDS THE SUBJECT. Without this, one nullifier authorizes an append to *any*
 * agent's history: a member granted the right to record TORCH's outcomes could
 * spend the same authorization against a competitor. The subject is in the
 * scope, so the nullifier for TORCH is a different value from the nullifier for
 * anyone else and the spent set separates them.
 *
 * BINDS AN EPOCH, and this is a rate limit, not decoration. A nullifier is
 * spent once. With `epoch` fixed, a member may append to a given subject's
 * history exactly once, ever. Callers choose the granularity — a day, an
 * evaluation round, a batch id — and that choice IS the write budget. There is
 * no unlimited setting, deliberately: "one authorization, unbounded appends" is
 * the state in which append-only protects nothing.
 */
function scopeForSubject(subject, epoch) {
    if (!subject)
        throw new Error('subject is required');
    if (!epoch) {
        throw new Error('epoch is required. Omitting it means one authorization appends without ' +
            'limit, which is the exact state append-only history is meant to prevent.');
    }
    assertEncodable(subject, 'subject');
    assertEncodable(epoch, 'epoch');
    return ['reputation', subject, epoch].join(FIELD_SEP);
}
/**
 * Append an event to a history root.
 *
 * The append rule is deliberately the simplest thing that is unambiguous:
 * `newRoot = H(prevRoot ‖ eventCommitment)`. A chain, not a balanced tree.
 *
 * WHY A CHAIN. A balanced Merkle tree gives cheap membership proofs for
 * arbitrary past events, which is what you want for *readable provenance* — and
 * readable provenance is explicitly not what this offers. A chain gives an
 * unambiguous "what came before", which is the only thing the transition needs
 * to constrain, at one hash per event instead of log(n). If selective
 * membership over history becomes a requirement, that is a different structure
 * and should be argued for on its own.
 *
 * ON REUSING `hashPair` FOR BOTH STRUCTURES. History nodes and group-tree nodes
 * go through the same function, so in principle a history root could be passed
 * off as a group root. It cannot in practice, and the reason is structural
 * rather than lucky: every history root descends from `GENESIS_ROOT`, a
 * readable non-hash-shaped constant, while every group root descends from
 * commitments, which are hash outputs. Confusing the two would require a
 * member's commitment to equal `GENESIS_ROOT`. The circuit should still
 * domain-separate the two node types rather than inherit this argument — see
 * `mustAlsoHold`.
 */
async function appendEvent(prevRoot, eventCommitment, scheme) {
    return scheme.hashPair(prevRoot, eventCommitment);
}
/** The empty history. A distinct constant, so "no events" is not "" or a hash of nothing. */
exports.GENESIS_ROOT = 'zkrepid:reputation-genesis:v1';
/**
 * Recompute a transition from its witness.
 *
 * Honest-prover checking, available today. Not the ZK proof — the return type
 * refuses to let a caller pretend otherwise, same as the binding contract.
 *
 * WHAT THIS CANNOT DO, no matter how carefully it is written: it cannot tell
 * you the nullifier is unspent, and it cannot tell you `prevRoot` is the head
 * you hold. Both need state this function does not have. They are in
 * `mustAlsoHold` and they are the verifier's job — `TRANSITION_CONTRACT` says
 * so in the same list, so a reader finds the gap without having to notice an
 * absence.
 */
async function verifyTransitionByRecomputation(statement, scheme) {
    const fail = (reason) => ({
        valid: false,
        provenWithoutWitness: false,
        reason,
    });
    const { publicInputs: pub, privateWitness: wit } = statement;
    let commitment;
    try {
        commitment = await commitEvent(wit.event, scheme);
    }
    catch (e) {
        return fail(`the event is not well-formed: ${e.message}`);
    }
    if (commitment !== wit.eventCommitment) {
        return fail('event commitment does not reopen — the recorded event is not the committed one');
    }
    // The scope must NAME the subject. Checked rather than assumed, because a
    // scope that does not bind the subject makes one write authorization valid
    // against every agent's history.
    const subjectPrefix = ['reputation', wit.event.subject, ''].join(FIELD_SEP);
    if (!pub.scope.startsWith(subjectPrefix) || pub.scope.length === subjectPrefix.length) {
        return fail('scope does not bind this subject (expected scopeForSubject(subject, epoch)) — ' +
            "an unbound scope authorizes appends to any agent's history");
    }
    const nullifier = await scheme.nullify(wit.secret, pub.domain, pub.scope);
    if (nullifier !== pub.nullifier) {
        return fail('nullifier does not reopen — the appender is not who the statement claims');
    }
    const appenderCommitment = await scheme.commit(wit.secret);
    if (appenderCommitment !== wit.appenderCommitment) {
        return fail("appender commitment does not reopen — the secret is not the committed member's");
    }
    // Membership walked from the RECOMPUTED commitment, not the witness one. In
    // this path the reopen check above already forces them equal; the choice is
    // kept because it is NOT redundant in the circuit, where membership can be
    // wired to an unconstrained witness value. That is the borrowed-member attack
    // (`mustAlsoHold`), and the reference implementation should express the same
    // intent the circuit must.
    let node = appenderCommitment;
    for (const step of wit.membership) {
        node = step.left
            ? await scheme.hashPair(step.hash, node)
            : await scheme.hashPair(node, step.hash);
    }
    if (node !== pub.groupRoot) {
        return fail('the appender is not a member of the group authorized to write reputation ' +
            'history — without this, anyone can extend anyone');
    }
    const expected = await appendEvent(pub.prevRoot, commitment, scheme);
    if (expected !== pub.newRoot) {
        return fail('newRoot is not prevRoot extended by this event — history was rewritten, not appended');
    }
    return {
        valid: true,
        provenWithoutWitness: false,
        reason: 'the event reopens, the appender reopens and is a member of the authorized ' +
            'group, the scope binds the subject, and newRoot extends prevRoot by exactly ' +
            'this event. Required the witness, so this is honest-prover checking rather ' +
            'than a proof. It establishes the SEQUENCE, never the score — and it does ' +
            'NOT establish that the nullifier is unspent or that prevRoot is the head ' +
            'you hold, both of which need state this function does not have.',
    };
}
/**
 * The obligations the Plonky3 transition circuit must discharge.
 *
 * Data rather than prose, so both lanes assert against one list.
 */
exports.TRANSITION_CONTRACT = {
    version: 'zkrepid-reputation-transition-v2',
    publicInputs: ['prevRoot', 'newRoot', 'nullifier', 'domain', 'scope', 'groupRoot'],
    privateWitness: ['event', 'eventCommitment', 'secret', 'appenderCommitment', 'membership'],
    relations: [
        'eventCommitment    == H(TRANSITION_TAG ‖ subject ‖ signal ‖ value ‖ observedAt), ‖ = U+001F',
        'appenderCommitment == H(tagCommit ‖ secret)',
        'nullifier          == H(tagNullifier ‖ secret ‖ domain ‖ scope)',
        'MerkleVerify(appenderCommitment, membership) == groupRoot',
        'newRoot            == H(prevRoot ‖ eventCommitment)',
        'scope              == "reputation" ‖ subject ‖ epoch',
    ],
    /**
     * Ways the circuit can produce a valid proof and the SYSTEM still be wrong.
     *
     * The first four are the verifier's job and no circuit can discharge them;
     * the rest are circuit obligations that a passing test suite does not imply.
     */
    mustAlsoHold: [
        'the nullifier is SPENT against a durable set, and spend-checking is the ' +
            "verifier's job. Without a spent set, one authorization appends unboundedly " +
            'and the "append-only" property protects nothing',
        'prevRoot is the CURRENT head the verifier holds, not one the prover chose. A ' +
            'prover supplying an old root forks the history and both branches verify',
        'groupRoot is a root the VERIFIER independently trusts. A prover-supplied root ' +
            'over a tree of their own construction proves membership of a group they ' +
            'invented',
        'the epoch inside scope advances on a schedule the verifier controls. A ' +
            'prover-chosen epoch is an unlimited write budget wearing a rate limit',
        'membership is proven over the appenderCommitment the circuit COMPUTED, not an ' +
            'independent witness value — otherwise a prover shows membership of someone ' +
            "else's commitment while nullifying with their own secret",
        'the event tag is distinct from the identity tags and CONSTRAINED, so an event ' +
            'commitment cannot be replayed as an identity commitment or vice versa',
        'the chain node hash is POSITIONAL — H(prevRoot, eventCommitment) must differ ' +
            'from H(eventCommitment, prevRoot). A commutative node hash makes "root R ' +
            'extended by event E" indistinguishable from the reverse, so an attacker ' +
            'chooses which value was the history',
        'history chain nodes and group-tree nodes are domain-separated in the circuit ' +
            'rather than both being a bare two-input hash — this reference relies on ' +
            'GENESIS_ROOT not being hash-shaped, which is an argument, not a constraint',
    ],
    /**
     * The claim boundary. Stated in the contract so it cannot be lost between the
     * two lanes.
     */
    provesTheSequenceNotTheScore: 'this circuit proves that events happened in this order, appended by ' +
        'authorized members, and none were inserted or removed. It does NOT prove ' +
        'the resulting score. Decay and shrinkage are time-dependent and are applied ' +
        'at read time with the current clock as a public input — a score changes with ' +
        'no new events, so there is no leaf for a circuit to constrain at the moment ' +
        'of decay.',
    /** Also unprovable here, and worth naming rather than discovering later. */
    observedAtIsAsserted: 'event.observedAt is supplied by whoever appended the event and is not ' +
        'constrained. A prover controls it. Read-time decay therefore rests on an ' +
        'assertion, and any consumer must treat it as such until a trusted time ' +
        'source exists.',
};
/**
 * The read-time half, stated as data so the split survives a handover.
 *
 * `EarnedMetrics` already implements this and is measured; nothing here
 * duplicates it. This constant exists so that a reader of the circuit contract
 * finds the other half rather than assuming there isn't one.
 */
exports.READ_TIME_SCORING = {
    implementedBy: 'lib/trustshell/EarnedMetrics.ts',
    appliedAtReadTime: [
        '30-day exponential recency decay',
        'empirical-Bayes shrinkage toward ZERO (not the fleet mean — shrinking toward ' +
            'a population average is the reputation-laundering vector)',
        'three states per signal: measured / insufficient / unmeasured, each carrying ' +
            'its reason',
    ],
    publicInputRequired: 'now',
    why: 'each is time-dependent or population-dependent, and neither can be pinned to ' +
        'an event in an append-only log without a trusted clock inside the proof.',
};
/** Re-exported so a reader of this contract can check tag distinctness in one place. */
exports.IDENTITY_TAGS = nullifier_1.BINDING_TAGS;
