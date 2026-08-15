# Paste-ready handover → repid-engine / XAI lane

Copy everything below the line into that lane. It asks for exactly what is
needed and nothing else, and states the acceptance criterion so a mismatch is
unambiguous.

---

**Poseidon2 parameters needed — trinity-ecosystem identity layer**

Decision confirmed on our side: **Poseidon2 is the canonical hash for every
circuit-bound commitment and nullifier.** We are not implementing it ourselves,
because a parameter set chosen independently produces values that look like
field elements, pass their own round-trip tests, and agree with no other
implementation — a mismatch nobody notices until two systems compare a root in
production, by which point both have persisted data under incompatible hashes.

Our placeholder (`PendingPoseidon2Scheme`) contains **no arithmetic at all** and
throws, so there is nothing to accidentally ship.

Please send the exact set in use in your working Plonky3 build (pin `27d59f73`):

| item | why we need it |
|---|---|
| Field | KoalaBear / BabyBear / Mersenne31 / Goldilocks — changes every output |
| Width `t` | state size; determines absorption layout |
| Full rounds `R_F` | wrong count = a different function that still "works" |
| Partial rounds `R_P` | same |
| S-box degree `α` | 3 / 5 / 7, field-dependent |
| Round constants | the full array, in application order |
| External (MDS) matrix | Poseidon2 uses different internal/external matrices |
| Internal matrix | both are required |
| Rate / capacity | how inputs are split |
| Absorption order + padding | a permuted order is a *different function* that still verifies internally |
| Domain tags | your byte/field encoding for the commit and nullifier tags |
| **≥3 test vectors** | input → output. **This is the acceptance criterion** |

We will implement against your test vectors and treat any mismatch as **our**
bug, not yours.

**The contract we have already written against it** (exported as data in
`lib/trustshell/identity/nullifier.ts` as `CIRCUIT_CONTRACT`, so both sides can
assert against one list rather than two readings of prose):

**This changed on 2026-08-14 — please build against the version below.** Our
first draft made `commitment` a public input and described the result as
unlinkable. That was wrong: a stable commitment beside every nullifier links all
of a holder's presentations. The holder now proves Merkle membership in a public
group, as Semaphore does.

```
public:  groupRoot, nullifier, domain, scope, tagCommit, tagNullifier
private: secret, commitment, membership path

commitment == H(tagCommit    ‖ secret)
nullifier  == H(tagNullifier ‖ secret ‖ domain ‖ scope)
MerkleVerify(commitment, membership) == groupRoot
```

The membership tree needs the **same Poseidon2 parameter set** as the
commitments, so please include whatever you use for internal-node hashing.

**Six ways the circuit can produce a valid proof and still be wrong.** Worth
checking explicitly rather than inferring from "it verifies":

1. **The same secret in both relations.** Two independent secrets satisfy each
   relation separately and prove nothing about their linkage — which is the
   entire claim.
2. **`domain` and `scope` must be PUBLIC inputs, not witness.** As witness, a
   prover can choose them after seeing the challenge, and unlinkability is
   forgeable.
3. **Tags distinct and constrained**, or a commitment can be replayed as a
   nullifier for some `(domain, scope)`.
4. **Absorption order constrained, not merely conventional.** A permuted order
   is a different function that verifies fine against itself.
5. **Membership proven over the commitment the circuit COMPUTED**, not an
   independent witness value — otherwise a prover shows membership of someone
   else's commitment while nullifying with their own secret.
6. **`groupRoot` is a root the verifier independently trusts.** A prover-supplied
   root over their own tree proves membership of a group they invented.

**And one the circuit cannot supply:** unlinkability is bounded by the group
size. A root over one commitment identifies the holder exactly. Report the
anonymity set with any privacy claim.

**A second circuit, same hash, sequenced behind the first.** The reputation
transition (`lib/trustshell/identity/reputation-transition.ts`,
`TRANSITION_CONTRACT`, version `zkrepid-reputation-transition-v2`). It reuses
your parameter set exactly — no new hash, no new tree shape:

```
public:  prevRoot, newRoot, nullifier, domain, scope, groupRoot
private: event, eventCommitment, secret, appenderCommitment, membership

  eventCommitment    == H(TRANSITION_TAG ‖ subject ‖ signal ‖ value ‖ observedAt)
  appenderCommitment == H(tagCommit ‖ secret)
  nullifier          == H(tagNullifier ‖ secret ‖ domain ‖ scope)
  MerkleVerify(appenderCommitment, membership) == groupRoot
  newRoot            == H(prevRoot ‖ eventCommitment)
  scope              == "reputation" ‖ subject ‖ epoch
```

`‖` is U+001F throughout, and a field containing it is **refused** rather than
escaped — an escaping rule is a second thing both lanes have to implement
identically. `TRANSITION_TAG` is `zkrepid:reputation-event:v1`, distinct from
your commit/nullifier tags and required to be constrained, so an event
commitment cannot be replayed as an identity commitment.

**What it proves and what it does not.** It proves the event SEQUENCE — that
events happened in this order, appended by authorized members, with none
inserted or removed. It does **not** prove the resulting score. Decay and
empirical-Bayes shrinkage are time-dependent, so a score changes with no new
events and there is no leaf for a circuit to constrain at the moment of decay;
both stay at read time with the clock as a public input. Please do not describe
the transition circuit as proving a reputation value — that is the overclaim we
are specifically trying to avoid, and it is stated as data in
`TRANSITION_CONTRACT.provesTheSequenceNotTheScore`.

Two more circuit obligations worth naming: the chain node hash must be
**positional** (`H(prev, event) ≠ H(event, prev)`, or an attacker chooses which
value was the history), and history chain nodes must be domain-separated from
group-tree nodes rather than both being a bare two-input hash.

**What we bring:** `BindingStatement` (public/private split, typed),
`IBindingScheme` (one implementation per parameter set — swapping in the real
one changes no caller), `verifyBindingByRecomputation` (honest-prover binding
available today, returning `provenWithoutSecret: false` so it can never be
reported as the identity proof), and `MerkleAlg` on every `Disclosure` so a
Poseidon2 credential and a SHA-256 one fail loudly against the wrong verifier
instead of silently disagreeing.

**On the two authorization models** — we are keeping both, and they are not
competitors:

| | ControlProof (ours) | nullifier ↔ commitment (yours) |
|---|---|---|
| answers | who authorized what, legibly | that the presenter privately controls the identity |
| revocable | yes — expiry, attenuation | no |
| unlinkable | **no** — the signature names the signer | **yes**, per `(domain, scope)` |

A signed grant cannot be unlinkable, because the signature names the signer. A
nullifier cannot express "may spend up to 100 USDC until Tuesday". Neither
subsumes the other.

Full detail: `docs/POSEIDON2-PARAMETER-REQUEST.md` in trinity-ecosystem `main`.
