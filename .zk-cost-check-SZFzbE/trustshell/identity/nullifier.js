"use strict";
// lib/trustshell/identity/nullifier.ts
//
// The statement/witness contract for the nullifier ↔ commitment circuit.
//
// THIS FILE OWNS THE SHAPE. It does not own the hash. The Plonky3 circuit lives
// in the lane with a working cargo toolchain; this side defines exactly what
// that circuit must prove, so both implementations write against one written
// contract instead of two compatible-looking guesses.
//
// ── CORRECTED 2026-08-14: the commitment is PRIVATE ──────────────────────────
//
// The first version of this contract listed `commitment` as a public input and
// described the result as unlinkable. That was wrong, and the error is worth
// recording because it is the single most common way this construction is
// mis-specified.
//
// A commitment is stable by design — it is the long-lived identifier for a
// holder. Publish it alongside every nullifier and every presentation carries
// the same value, so all of a holder's actions link together trivially.
// Scope-varying nullifiers give unlinkability ACROSS SCOPES; they do nothing
// when a stable identifier travels beside them. That is pseudonymity wearing
// unlinkability's name.
//
// Semaphore gets the real property from the part the first draft omitted: the
// holder proves MEMBERSHIP of their commitment in a public group, without
// revealing which member they are. The commitment moves to the witness; a group
// root becomes the public anchor.
//
// WHAT THE CIRCUIT PROVES
//
//   public:  groupRoot, nullifier, domain, scope, tagCommit, tagNullifier
//   private: secret, commitment, membership path
//
//   commitment == H(tagCommit    ‖ secret)
//   nullifier  == H(tagNullifier ‖ secret ‖ domain ‖ scope)
//   MerkleVerify(commitment, path) == groupRoot
//
// A verifier learns: someone in this group, who knows the secret behind their
// commitment, produced this nullifier for this (domain, scope). It does not
// learn which member — that is the whole point.
//
// ── THE CAVEAT THAT MUST TRAVEL WITH THE CLAIM ───────────────────────────────
//
// UNLINKABILITY IS BOUNDED BY THE GROUP SIZE. A root over one commitment proves
// membership in a set of one, which identifies the holder exactly. A root over
// five identifies them to within five. The construction is sound at any size and
// the PRIVACY is not — so any system reporting "unlinkable" must also report the
// anonymity set it achieved. `GroupSizeWarning` below exists so that number is
// carried rather than assumed.
//
// ── TWO LEVELS OF ASSURANCE, NEVER CONFLATED ─────────────────────────────────
//
//   recomputed — the verifier holds the secret and recomputes everything. Real
//                evidence, but the secret is disclosed, so it works only where
//                the verifier is already trusted with it. Honest-prover binding.
//   proven     — a circuit checked the relations with the secret hidden. The
//                actual identity proof, and it needs the Plonky3 side.
//
// `BindingVerification.provenWithoutSecret` separates them, and is false for
// every scheme in this file today.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CIRCUIT_CONTRACT = exports.MIN_MEANINGFUL_GROUP = exports.PendingPoseidon2Scheme = exports.MISSING_PARAMETERS = exports.BINDING_TAGS = void 0;
exports.describeAnonymitySet = describeAnonymitySet;
exports.buildGroup = buildGroup;
exports.buildBindingStatement = buildBindingStatement;
exports.verifyBindingByRecomputation = verifyBindingByRecomputation;
/** Domain separation tags. Distinct so a commitment can never read as a nullifier. */
exports.BINDING_TAGS = {
    commit: 'zkrepid:commit:v1',
    nullifier: 'zkrepid:nullifier:v1',
};
exports.MISSING_PARAMETERS = 'Poseidon2 parameters are not available in this lane, and inventing them is ' +
    'refused: a guessed parameter set produces values that look correct, pass ' +
    'their own tests, and agree with no other implementation. Required from the ' +
    'lane with a working Plonky3 build — field, width (t), full/partial round ' +
    'counts, S-box degree, round constants, MDS/internal matrix, sponge ' +
    'absorption order and padding, and at least 3 input/output test vectors. ' +
    'See docs/POSEIDON2-PARAMETER-REQUEST.md.';
/**
 * Placeholder for Poseidon2 that REFUSES TO COMPUTE.
 *
 * An implementation with invented parameters would produce plausible field
 * elements, pass its own round-trip tests, and agree with no other
 * implementation on earth — and nothing downstream would notice until two
 * systems compared a root in production. This throws instead, naming what is
 * missing. Same discipline as `proven: false` on ZKPAttestation.
 */
class PendingPoseidon2Scheme {
    scheme = 'poseidon2-v1-PENDING-PARAMETERS';
    parametersKnown = false;
    async commit() {
        throw new Error(exports.MISSING_PARAMETERS);
    }
    async nullify() {
        throw new Error(exports.MISSING_PARAMETERS);
    }
    async hashPair() {
        throw new Error(exports.MISSING_PARAMETERS);
    }
}
exports.PendingPoseidon2Scheme = PendingPoseidon2Scheme;
/** Below this, the group is small enough that membership is close to naming. */
exports.MIN_MEANINGFUL_GROUP = 2;
function describeAnonymitySet(size) {
    if (size <= 1) {
        return {
            size,
            adequate: false,
            note: 'a group of one proves membership in a set of one, which identifies the ' +
                'holder exactly. The construction is sound; the privacy is absent. Do not ' +
                'describe this as unlinkable.',
        };
    }
    if (size < 8) {
        return {
            size,
            adequate: false,
            note: `a group of ${size} narrows the holder to one of ${size}. Sound, but the ` +
                `anonymity set must be reported with any privacy claim.`,
        };
    }
    return {
        size,
        adequate: true,
        note: `holder is one of ${size}; report this number with any unlinkability claim`,
    };
}
/**
 * Build a membership tree over a group's commitments.
 *
 * Odd nodes are carried up unchanged rather than duplicated — duplicating the
 * last node lets two different groups share a root.
 */
async function buildGroup(commitments, scheme) {
    if (commitments.length === 0)
        throw new Error('a group needs at least one commitment');
    const levels = [[...commitments]];
    while (levels[levels.length - 1].length > 1) {
        const cur = levels[levels.length - 1];
        const next = [];
        for (let i = 0; i < cur.length; i += 1) {
            next.push(i + 1 < cur.length ? await scheme.hashPair(cur[i], cur[i + 1]) : cur[i]);
        }
        levels.push(next);
    }
    return {
        root: levels[levels.length - 1][0],
        pathFor(commitment) {
            let idx = levels[0].indexOf(commitment);
            if (idx === -1)
                throw new Error('commitment is not in this group');
            const path = [];
            for (let l = 0; l < levels.length - 1; l++) {
                const isRight = idx % 2 === 1;
                const sib = isRight ? idx - 1 : idx + 1;
                if (sib < levels[l].length)
                    path.push({ hash: levels[l][sib], left: isRight });
                idx = Math.floor(idx / 2);
            }
            return path;
        },
    };
}
async function buildBindingStatement(input) {
    if (!input.secret)
        throw new Error('secret is required');
    if (!input.domain)
        throw new Error('domain is required — it separates authorization contexts');
    if (!input.scope)
        throw new Error('scope is required — it is what makes nullifiers unlinkable');
    if (!input.groupRoot) {
        throw new Error('groupRoot is required. Without a membership anchor the commitment would have ' +
            'to be public, and a public commitment is linkable across every presentation.');
    }
    return {
        scheme: input.scheme.scheme,
        publicInputs: {
            groupRoot: input.groupRoot,
            nullifier: await input.scheme.nullify(input.secret, input.domain, input.scope),
            domain: input.domain,
            scope: input.scope,
            tagCommit: exports.BINDING_TAGS.commit,
            tagNullifier: exports.BINDING_TAGS.nullifier,
        },
        privateWitness: {
            secret: input.secret,
            commitment: await input.scheme.commit(input.secret),
            membership: input.membership,
        },
    };
}
/**
 * Recompute every relation from the witness, including membership.
 *
 * Honest-prover binding: useful where the verifier legitimately holds the
 * secret. NOT the identity proof, and the return type refuses to let a caller
 * pretend otherwise.
 */
async function verifyBindingByRecomputation(statement, scheme) {
    if (statement.scheme !== scheme.scheme) {
        return {
            valid: false,
            provenWithoutSecret: false,
            reason: `statement uses '${statement.scheme}' but the supplied scheme is '${scheme.scheme}'`,
        };
    }
    const commitment = await scheme.commit(statement.privateWitness.secret);
    if (commitment !== statement.privateWitness.commitment) {
        return { valid: false, provenWithoutSecret: false, reason: 'commitment does not reopen' };
    }
    const nullifier = await scheme.nullify(statement.privateWitness.secret, statement.publicInputs.domain, statement.publicInputs.scope);
    if (nullifier !== statement.publicInputs.nullifier) {
        return { valid: false, provenWithoutSecret: false, reason: 'nullifier does not reopen' };
    }
    // Membership, walked from the RECOMPUTED commitment rather than the witness
    // one.
    //
    // In this recomputation path that choice is redundant: the reopen check above
    // already forces the two equal, so a mutation swapping them survives the test
    // suite. Verified, and documented rather than deleted — because the property
    // is NOT redundant in the circuit, where there is no separate "reopen" step
    // and the membership constraint may be wired to an unconstrained witness
    // value. That is `mustAlsoHold[1]`, and it is the borrowed-member attack:
    // prove membership of a commitment that IS in the group while nullifying with
    // a different secret. Keeping the two consistent here means the reference
    // implementation and the circuit express the same intent.
    let node = commitment;
    for (const step of statement.privateWitness.membership) {
        node = step.left
            ? await scheme.hashPair(step.hash, node)
            : await scheme.hashPair(node, step.hash);
    }
    if (node !== statement.publicInputs.groupRoot) {
        return {
            valid: false,
            provenWithoutSecret: false,
            reason: 'commitment is not a member of the group named by groupRoot',
        };
    }
    return {
        valid: true,
        provenWithoutSecret: false,
        reason: 'commitment reopens, nullifier reopens, and membership verifies against the ' +
            'group root. This required the secret, so it is honest-prover binding, not a ' +
            'zero-knowledge identity proof — the circuit is what removes the secret from ' +
            'the verifier.',
    };
}
/**
 * The exact obligations the Plonky3 circuit must discharge.
 *
 * Data rather than prose so both lanes assert against the same list, and so a
 * circuit that silently drops one is detectable.
 */
exports.CIRCUIT_CONTRACT = {
    version: 'zkrepid-binding-v2',
    publicInputs: ['groupRoot', 'nullifier', 'domain', 'scope', 'tagCommit', 'tagNullifier'],
    privateWitness: ['secret', 'commitment', 'membership'],
    relations: [
        'commitment == H(tagCommit || secret)',
        'nullifier  == H(tagNullifier || secret || domain || scope)',
        'MerkleVerify(commitment, membership) == groupRoot',
    ],
    /**
     * Ways a circuit can produce a valid proof and still be wrong. Each is a
     * distinct failure, and each has been the published bug in some real system.
     */
    mustAlsoHold: [
        'the same secret is used in BOTH the commitment and nullifier relations — two ' +
            'independent secrets satisfy each separately and prove nothing about linkage',
        'the membership proof is over the COMMITMENT THE CIRCUIT COMPUTED, not an ' +
            'independent witness value — otherwise a prover shows membership of someone ' +
            "else's commitment while nullifying with their own secret",
        'domain and scope are PUBLIC inputs, not witness — as witness, a prover could ' +
            'choose them after seeing the challenge and forge unlinkability',
        'the tags are distinct and constrained, so a commitment cannot be replayed as a ' +
            'nullifier for some (domain, scope)',
        'the absorption order is fixed and constrained, not merely conventional — a ' +
            'permuted order is a different function that still verifies internally',
        'groupRoot is a root the VERIFIER independently trusts. A prover-supplied root ' +
            'over a tree of their own construction proves membership of a group they ' +
            'invented, which is no membership at all',
    ],
    /**
     * Not a soundness property — a privacy one, and it cannot be fixed in the
     * circuit. Stated here so it travels with the contract.
     */
    privacyCaveat: 'unlinkability is bounded by the group size. A root over one commitment ' +
        'identifies the holder exactly. Report the anonymity set with any privacy ' +
        'claim — see describeAnonymitySet().',
};
