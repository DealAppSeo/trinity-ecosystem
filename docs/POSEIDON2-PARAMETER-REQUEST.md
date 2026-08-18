# Poseidon2 parameter request — trinity-ecosystem → repid-engine lane

**Status 2026-08-17: PARTIAL — the parameters were never missing.**
Every row of the table below except the last three was already answered in
`repid-engine/src/zkp/poseidon2-babybear.ts`, dated **2026-08-10**, four days
before this request was written. It is now copied into this lane at
`lib/trustshell/identity/poseidon2-babybear.ts` (byte-identical, md5-compared)
and verified against Plonky3's own oracle — **12 KAT vectors, 0 failures**, via
`npm run check:poseidon2`.

| | |
|---|---|
| **SETTLED** | field, width, R_F, R_P, α, round constants, both matrices, and the 2-scalar hash `H(a,b) = Perm16([a,b,0..])[0]` |
| **STILL OPEN** | `secret: string` → field encoding; domain-tag encoding; absorption layout for the **4-input** nullifier |
| **`IBindingScheme`** | still refuses. `PendingPoseidon2Scheme` throws, and `check:poseidon2` asserts that it does |

The three open items are the ones a KAT cannot answer: the oracle fixes the
2-scalar case only, and a permuted absorption order is a different function that
still verifies internally. They need the circuit's answer, not this lane's.

**Decided 2026-08-14:** Poseidon2 is the canonical hash for every circuit-bound
commitment and nullifier across both lanes.

---

## Why this is a request and not an implementation

This lane will **not** implement Poseidon2 from a specification. A parameter set
chosen independently produces values that look like field elements, pass their
own round-trip tests, and agree with no other implementation. The failure is
silent until two systems compare a root in production, and by then both have
persisted data under incompatible hashes.

`PendingPoseidon2Scheme` therefore **throws rather than computing**. There is no
placeholder arithmetic to accidentally ship. `parametersKnown` is `false`, and
a caller can branch on it instead of discovering the gap by catching.

This is the same discipline as `proven: false` on `ZKPAttestation` and
`isZeroKnowledge: false` on `WebCryptoProofProvider`: a component that cannot do
the job says so rather than emitting something shaped like an answer.

---

## What is needed

From the lane with the working Plonky3 build (pin `27d59f73`), the exact set in
use — not a reference to a paper, since papers admit several instantiations:

| item | why it matters |
|---|---|
| **Field** | KoalaBear / BabyBear / Mersenne31 / Goldilocks — changes every output |
| **Width `t`** | state size; determines absorption layout |
| **Full rounds `R_F`** | wrong count = different function, still "valid" |
| **Partial rounds `R_P`** | as above |
| **S-box degree `α`** | 3, 5, 7 … field-dependent |
| **Round constants** | the full array, in application order |
| **External (MDS) matrix** | Poseidon2 uses different internal/external matrices |
| **Internal matrix** | as above — both are required |
| **Sponge rate / capacity** | determines how inputs are split |
| **Absorption order and padding** | a permuted order is a *different function* that still verifies internally |
| **Domain tags** | the byte/field encoding of `zkrepid:commit:v1` and `zkrepid:nullifier:v1`, or the lane's equivalents |
| **≥ 3 test vectors** | input → output, enough to catch an off-by-one round |

Test vectors are the acceptance criterion. This lane will implement against
them and treat a mismatch as this lane's bug.

---

## The contract the circuit must discharge

Encoded as data in `lib/trustshell/identity/nullifier.ts` (`CIRCUIT_CONTRACT`)
so both sides can assert against one list rather than two readings of prose.

**CORRECTED 2026-08-14 — the commitment is PRIVATE.** The first version of this
contract made `commitment` a public input and called the result unlinkable. That
was wrong: a commitment is stable by design, so publishing it beside every
nullifier links all of a holder's presentations. Scope-varying nullifiers give
unlinkability *across scopes*; they do nothing when a fixed identifier travels
alongside. The holder now proves Merkle **membership** in a public group instead,
as Semaphore does.

```
public:  groupRoot, nullifier, domain, scope, tagCommit, tagNullifier
private: secret, commitment, membership path

commitment == H(tagCommit    ‖ secret)
nullifier  == H(tagNullifier ‖ secret ‖ domain ‖ scope)
MerkleVerify(commitment, membership) == groupRoot
```

The membership tree must use the **same parameter set** as the commitments — a
tree of Poseidon2 leaves with SHA-256 internal nodes is two hash functions in one
circuit for no benefit. `IBindingScheme` therefore carries `hashPair` alongside
`commit`/`nullify`.

### Six properties a working proof can still lack

A circuit can produce a valid proof and be wrong in each of these ways. Worth
checking explicitly rather than inferring from "it verifies":

1. **The same secret in both relations.** Two independent secrets satisfy each
   relation separately and prove nothing about their linkage — which is the
   entire claim.
2. **`domain` and `scope` are public inputs, not witness.** As witness, a prover
   can choose them after seeing the challenge, and unlinkability is forgeable.
3. **The tags are distinct and constrained.** Otherwise a commitment can be
   replayed as a nullifier for some `(domain, scope)`.
4. **Absorption order is constrained, not merely conventional.** A permuted
   order is a different function that verifies fine against itself.
5. **Membership is proven over the commitment the circuit COMPUTED**, not an
   independent witness value. Otherwise a prover shows membership of someone
   else's commitment while nullifying with their own secret — the borrowed-member
   attack.
6. **`groupRoot` is a root the verifier independently trusts.** A prover-supplied
   root over a tree of their own construction proves membership of a group they
   invented, which is no membership at all.

### And one property no circuit can supply

**Unlinkability is bounded by the group size.** A root over one commitment
identifies the holder exactly; a root over five narrows them to five. The
construction is sound at any size and the privacy is not. Any system reporting
"unlinkable" must report the anonymity set alongside it — `describeAnonymitySet()`
exists so the number travels rather than being assumed.

---

## What this lane provides in return

- `BindingStatement` — the public/private split, already typed.
- `IBindingScheme` — one implementation per parameter set; swapping in the real
  one changes no caller.
- `verifyBindingByRecomputation` — honest-prover binding available today, which
  returns `provenWithoutSecret: false` so it can never be reported as the
  identity proof.
- `MerkleAlg` on every `Disclosure`, so a Poseidon2 credential and a SHA-256 one
  fail loudly against the wrong verifier instead of silently disagreeing.

---

## Two authorization models, both kept

Recorded here because it is the question this request usually raises.

| | `ControlProof` (this lane) | nullifier ↔ commitment |
|---|---|---|
| answers | who authorized what, legibly | that the presenter privately controls the identity |
| revocable | yes — expiry, attenuation | no — a nullifier is not a permission |
| unlinkable | **no**, the signature names the signer | **yes**, per `(domain, scope)` |
| human-readable | yes | no |

Neither subsumes the other. A signed grant cannot be unlinkable, because the
signature names the signer. A nullifier cannot express "may spend up to X USDC
until Tuesday". Keeping both is the design.
