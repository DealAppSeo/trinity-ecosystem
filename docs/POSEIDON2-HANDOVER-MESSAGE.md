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

```
public:  commitment, nullifier, domain, scope, tagCommit, tagNullifier
private: secret

commitment == H(tagCommit    ‖ secret)
nullifier  == H(tagNullifier ‖ secret ‖ domain ‖ scope)
```

**Four ways the circuit can produce a valid proof and still be wrong.** Worth
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
