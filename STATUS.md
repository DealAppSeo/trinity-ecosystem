# STATUS — zkRepID TrustShell identity layer

**Updated:** 2026-08-14 · **Branch:** `claude/zkrepid-agentic-os-jfbi18` · **Gate:** `npm run check` exit 0 · `check:identity` **104** · E2E 26 VERIFIED / 0 FAILED, core 10/10

---

## The pivot, and the measurement behind it

Priority 1 as originally briefed ended in "Plonky3 selective-disclosure linking
proof". **Plonky3 cannot be compiled in _this sandboxed container_**, verified
this session rather than assumed. (Scope matters: the XAI lane builds it fine on
a developer machine and has produced a real STARK. An earlier version of this
file said "no Claude session can build Rust in this ecosystem", which
generalised one environment to all of them and was wrong.)

```
cargo check --offline  →  error: failed to download `aho-corasick v1.1.4`
                          (attempting to make an HTTP request, but --offline was specified)
cargo fetch            →  hangs until killed (proxy denies static.crates.io)
```

That is task #75, still open. Writing circuits tonight would have produced code
that cannot be compiled, run, or tested — the precise failure this repo
documents in `docs/PRIOR-WORK-INDEX.md` ("a mutation that does not compile is
not evidence"; two sprints lost to unmeasured work).

**So Priority 1 was split along the line the cryptography already draws:**

| layer | what it does | status |
|---|---|---|
| **Binding** | human authorizes agent; verifiable by anyone, offline | **BUILT, 57 assertions** |
| **Disclosure** | reveal some credential claims, hide the rest | **BUILT** |
| **ZK predicate** | prove `repid >= threshold` *without revealing repid* | **BLOCKED** (task #75) |

The first two are real cryptography and are what SD-JWT and the W3C VC
disclosure profiles actually use. The third is the only part that needs a SNARK,
and it is isolated behind one interface.

---

## What is built

`lib/trustshell/identity/` — 5 modules, **zero new dependencies**, WebCrypto only
(so the same code verifies in a browser, an edge runtime, and Node ≥ 22).

| module | responsibility |
|---|---|
| `did.ts` | `did:key` (Ed25519, multicodec `0xed01`, base58btc), sign/verify |
| `disclosure.ts` | salted Merkle credential; selective disclosure + verification |
| `identity.ts` | `HumanSSID` (controller), `AgentIdentity`, ERC-8004 binding |
| `capability.ts` | attenuation algebra — narrowing only, fails closed |
| `proof-provider.ts` | `IProofProvider` seam + `WebCryptoProofProvider` |
| `control-proof.ts` | the central artifact — dual-auth authorization |
| `nonce-store.ts` | atomic spent-nonce store — `consume`, deliberately no `has()` |
| `delegation.ts` | sub-agent chains — capability, audience **and time** attenuate per link |
| `repid-predicate.ts` | measured RepID → predicate; evidence quality is public, score is not |
| `nullifier.ts` | the circuit contract — statement/witness, and a placeholder that refuses |
| `memory-authz.ts` | dual-auth memory access — read never implies write; fails closed |
| `harness-bundle.ts` | the portable harness — parts signed together so they cannot be spliced |
| `reputation-transition.ts` | reputation as a constrained append, not a mutable column — proves the sequence, never the score |

---

## Design rationale (the calls worth defending)

**1. Key management stays in `did.ts`; `IProofProvider` covers only predicates.**
The brief proposed folding `generateKeyPair`/`sign` into the proof provider.
Rejected: Plonky3 does not generate Ed25519 keys, and the *authentication* layer
is permanent while the *predicate* layer is what upgrades. Merging them would
drag key management through the Plonky3 swap — the opposite of a clean seam.

**2. `did:key`, not `did:web`.** `did:web` resolves over HTTPS against a domain,
which reintroduces exactly the dependency the no-lock-in requirement removes.
With `did:key` the public key *is* the identifier, so verification is pure local
computation. Revocation belongs in the authorization layer, not the identifier.

**3. Per-claim salts are load-bearing, not decoration.** Without them an
undisclosed claim is brute-forceable whenever its value is low-entropy — and
real claims are exactly that (`country=US`, `tier=Silver`). An attacker with
only the Merkle root hashes every candidate and compares. Salts for undisclosed
claims are never serialized.

**4. Audience binding is mandatory.** A proof minted for `trinity:pay` and
captured in transit would otherwise replay against `trinity:vault`, since the
signature is valid in both places. `audience` is required at issuance and is a
core check at verification.

**5. Attenuation matches whole segments only.** `pay:usd*` does **not** cover
`pay:usdt` — partial-segment matching would let a typo silently authorize a
different asset. This is the foundation Priority 4 (sub-agents under
constraints) needs: a parent holding `pay:usdc` cannot mint a child with `pay:*`.

**6. `witnessHidden` / `isZeroKnowledge` are false, permanently, for the
WebCrypto provider.** Not a TODO. A hash commitment cannot be made
zero-knowledge by improving that class: to verify `commit-sha256:<h>` opens to
`repid=3723`, a verifier needs the preimage — give it and they know the score,
withhold it and they can check nothing. Only a different provider changes that
bit. This is the distinction the old code erased when it labelled a SHA-256 of a
timestamp `groth16` and published it on-chain.

---

## Honest capability boundary

| property | status |
|---|---|
| Human authorized this agent | **VERIFIED** — Ed25519, checkable offline |
| Agent holds its own key | **VERIFIED** — counter-signature over the grant |
| Grant unexpired, audience-bound, in scope | **VERIFIED** |
| Disclosed claims belong to the signed credential | **VERIFIED** — Merkle path |
| Undisclosed claims stay hidden | **VERIFIED** — per-claim salts |
| Replay defence, within one instance | **VERIFIED over HTTP** — second presentation of the same proof is refused |
| Replay defence, across instances | **NOT CHECKED** — needs migration `20260814090000_control_proof_nonces.sql` (unapplied, Sean-gated) |
| `repid >= threshold` **without revealing repid** | **NOT PROVEN** — needs Plonky3 (#75) |
| Agent DID ↔ ERC-8004 `agentId` | **CLAIMED, never proven** — different curves; see below |

The ERC-8004 binding is deliberately `claimed`. The token owner is a secp256k1
EVM address and the DID is Ed25519; neither key can sign for the other. There is
no `proveErc8004Binding` function, and a test asserts there isn't — writing one
that returned `proven` without an owner signature is how `humanCustodyBound`
became an unverifiable boolean in the first place.

---

## Verification

`npm run check` → **exit 0, 448 assertions**, `tsc --noEmit` 0 errors.
`check:identity` → **79 assertions**, stable across repeated runs.
`npm run test:e2e` → **26 VERIFIED, 4 NOT CHECKED, 0 FAILED, core 10/10**.

The identity path is exercised over real HTTP against a real handler, not only
in unit assertions: proofs are minted by the same modules a real holder runs and
posted to `POST /api/trustshell/control-proof/verify`. Forgery, wrong audience,
replay, capability escalation and disclosure tampering are all rejected
**server-side**, and a withheld claim never appears in the response.

Two of those E2E steps are core, chosen so the gate must be shown to both open
and close: `control_proof_verifies_over_http` and
`forged_control_proof_rejected_over_http`. A gate that only ever closes is
indistinguishable from a broken one.

**Mutation testing — the suite was verified by breaking the code, not by reading
it.** 9 mutations, each checked for compile success (a mutation that does not
compile proves nothing):

| mutation | result |
|---|---|
| salt removed → disclosure brute-forceable | **CAUGHT** (2) |
| counter-signature covers only the nonce | **CAUGHT** (1) |
| audience check always passes | **CAUGHT** (1) |
| attenuation permits anything | **CAUGHT** (7) |
| wildcard matches mid-segment | **CAUGHT** (1) |
| expiry ignored | **CAUGHT** (1) |
| leaf/node domain separation removed | **SURVIVED → now caught** (guard added) |
| counter-sig drops `humanSignature` component | **SURVIVES — documented** |
| `NOT_CHECKED` counts as verified | **SURVIVES — unobservable** |

The two remaining survivors are reported rather than hidden:

- **`humanSignature` component.** Removing it is undetectable, and honestly so:
  the counter-signature already covers the whole grant including `humanDid` and
  a random nonce, and Ed25519 is deterministic, so there is exactly one valid
  human signature per grant. It is kept as defence in depth for the case where a
  future change narrows what the grant payload covers. The original code comment
  overstated this and has been corrected.
- **`NOT_CHECKED` strictness.** All four core checks always execute, so none can
  *be* `NOT_CHECKED` today. The strictness is defensive, not currently
  load-bearing.

Two defects were found by running rather than reading, and both are fixed: a
test named "A LIFTED COUNTER-SIGNATURE FAILS" that actually only tested nonce
uniqueness, and a substring assertion (`blob.includes('412')`) that matched by
chance inside random hex roughly one run in three.

---

## Delegation chains (Priority 4 foundation)

`delegate()` hands a sub-agent a subset of its parent's authority. Four things
attenuate at every link, and the third is the one that gets forgotten:

| | |
|---|---|
| capabilities | child ⊆ parent, wildcard-aware |
| audience | a chain cannot retarget its verifier |
| **time** | `child.expiresAt <= parent.expiresAt` |
| start | `child.notBefore >= parent.notBefore` |

Time matters because **expiry is this system's only revocation** — there is
deliberately no revocation registry. If a child may outlive its parent, letting
the parent expire revokes nothing and the sub-agent keeps acting on authority
whose source is gone.

Also enforced: subject continuity (each link's delegator must be the principal
the previous link authorized — otherwise a chain is just a pile of individually
valid signatures), possession by counter-signature, and a depth bound, since
verification is linear in depth and the chain arrives from whoever presents it.

`requiredCapabilities` is checked against the **leaf**, never the root. Checking
at the root would pass whenever the root is broad, which is exactly what
delegation narrows.

### A flaw this found in my own tests

Three delegation mutations survived: *attenuation not enforced at verify*,
*audience retargeting allowed*, *possession not proven*. All three for one
reason — those tests edited the grant **after** signing, so each failed at the
signature check and never reached the rule it claimed to exercise. Same shape as
the lifted-counter-signature test corrected earlier in this branch.

Rewritten to forge properly-signed malicious links with real keys, so only the
*content* is hostile. All three now caught. A test that passes for the wrong
reason is indistinguishable from one that passes for the right one, until
something makes it prove which.

---

## Custody shadow mode (LESSONS A11)

`VaultPermission.ts:48` denies vault access on
`agent_kya_registry.human_custody_verified` — `true` for five agents while
`custodian_zkp_proof` is NULL in all twelve rows. A live authorization decision
resting on an assertion nobody can re-check.

`CustodyShadow` now watches that gate and **changes nothing**. Three properties,
each mutation-tested:

1. **Never alters the decision.** The legacy verdict is what the caller acts on.
2. **Never throws into the caller.** An observability path that can break vault
   access is worse than no observability — a malformed proof, a missing table
   and a throwing client are all contained and recorded as `error`.
3. **Expects to be uninformative at first, and says so.** Nothing presents a
   proof yet, so early observations are almost all `not_comparable`. Reading
   that as agreement would be this repo's own defect one layer up, so the
   recorded detail states explicitly that it is *not* agreement.

`shadow_looser` (legacy denies, proof allows) is reported separately from
`shadow_stricter` rather than averaged into a disagreement rate: only one of
those directions grants access the live gate refuses.

---

## Credential rotation

`scripts/rotate-erc8004-deployer.mjs` moves the ERC-8004 identities off the
compromised signer. Deliberately a **local** script rather than something this
session executes: running it here would pull a live private key into a context
that keeps a transcript, which is the same class of mistake that leaked it.

Verified on-chain 2026-08-14: the key has **not been used** — nonce, balance and
all three `ownerOf` results are unchanged from discovery. The registry is a
genuine ERC-721 (`supportsInterface(0x80ac58cd)` = true), so `safeTransferFrom`
is the correct call; checked, not assumed.

Dry run is the default. The script verifies by re-reading `ownerOf` after each
transfer rather than trusting receipts, and exits non-zero if any identity did
not arrive.

---

## Poseidon2 — decided, and deliberately not implemented here

**Decision 2026-08-14: Poseidon2 is the canonical hash for every circuit-bound
commitment and nullifier across both lanes.** SHA-256 inside an arithmetic
circuit costs orders of magnitude more constraints than a ZK-friendly sponge,
and the stated endpoint of this whole roadmap is a Plonky3 circuit over these
commitments — so the hash that is cheap to verify outside a circuit is the wrong
one to have baked in.

**This lane does not implement it.** `PendingPoseidon2Scheme` contains no
arithmetic at all; it throws. A parameter set chosen independently produces
values that look like field elements, pass their own round-trip tests, and agree
with no other implementation — and nothing downstream notices until two systems
compare a root in production, by which point both have persisted data under
incompatible hashes. `docs/POSEIDON2-PARAMETER-REQUEST.md` lists exactly what is
needed, with test vectors as the acceptance criterion.

### The contract this lane owns

**Corrected 2026-08-14 — the commitment is PRIVATE.** The first version of this
contract made `commitment` a public input and called the result unlinkable. That
was wrong. A commitment is stable by design, so publishing it beside every
nullifier links all of a holder's presentations: scope-varying nullifiers give
unlinkability *across scopes* and do nothing when a fixed identifier travels
alongside. That is pseudonymity wearing unlinkability's name. The holder now
proves Merkle **membership** in a public group, as Semaphore does.

```
public:  groupRoot, nullifier, domain, scope, tagCommit, tagNullifier
private: secret, commitment, membership path

         commitment == H(tagCommit    ‖ secret)
         nullifier  == H(tagNullifier ‖ secret ‖ domain ‖ scope)
         MerkleVerify(commitment, membership) == groupRoot
```

`CIRCUIT_CONTRACT` (version `zkrepid-binding-v2`) exports this as data, plus six
ways a circuit can produce a valid proof and still be wrong: two independent
secrets satisfying each relation separately; `domain`/`scope` as witness rather
than public (a prover then picks them after seeing the challenge and
unlinkability is forgeable); unconstrained tags letting a commitment replay as a
nullifier; an absorption order that is conventional rather than constrained;
membership proven over an independent witness value rather than the commitment
the circuit computed (the borrowed-member attack); and a prover-supplied
`groupRoot`, which proves membership of a group they invented.

**And one property no circuit can supply: unlinkability is bounded by the group
size.** A root over one commitment identifies the holder exactly.
`describeAnonymitySet()` exists so that number travels with the claim rather
than being assumed.

### Two levels of assurance, never conflated

`verifyBindingByRecomputation` is real evidence that one secret produced both
values — but the verifier had to be handed the secret, so it returns
`provenWithoutSecret: false`. The circuit is what removes the secret from the
verifier. That bit is the difference between honest-prover binding and an
identity proof, and the type will not let a caller blur it.

### Both authorization models are kept

| | `ControlProof` | nullifier ↔ commitment |
|---|---|---|
| answers | who authorized what, legibly | that the presenter privately controls the identity |
| revocable | yes — expiry, attenuation | no |
| unlinkable | **no** — the signature names the signer | **yes**, per `(domain, scope)` |

Neither subsumes the other, and that is the design rather than indecision.

---

## Reputation as a constrained transition

`reputation-transition.ts`. The defect this targets is the one that produced
LESSONS A11 and the retracted RepID figures alike: a value that can be *written*
rather than *earned*. `human_custody_verified` is `true` for five agents with
nothing behind it. If a score can only move through a transition a circuit
constrains, forging it means forging history.

### The boundary, which is forced rather than chosen

```
IN circuit      each event is well-formed, appended by a member of the group
                authorized to write THIS subject's history, and chained onto the
                previous root — nothing inserted, reordered, or removed.
OUT of circuit  the score: EarnedMetrics' 30-day decay and empirical-Bayes
                shrinkage, applied at READ time with the current clock as input.
```

Decay is time-dependent — a score changes with **no new events**, so there is no
leaf at the moment of decay for a circuit to constrain. In-circuit decay needs a
trusted clock inside the proof, which is a genuinely hard and separate problem.

So the honest claim is *"these events happened, in this order, appended by
authorized members, and none were inserted or removed"* — **not** "the score is
3723". The score is a pure function of a proven sequence plus a public
timestamp: strictly stronger than a number in a table, and weaker than a proven
score, which nobody has. `TRANSITION_CONTRACT.provesTheSequenceNotTheScore`
carries that sentence as data so it cannot be lost between the two lanes.

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

**The scope binds the subject and an epoch, and both are load-bearing.** Without
the subject, one write authorization is valid against *every* agent's history —
a member granted the right to record TORCH's outcomes could spend it against a
competitor. Without an epoch, a nullifier authorizes unbounded appends, which is
the exact state append-only history exists to prevent. `scopeForSubject()`
refuses an empty epoch rather than defaulting to one, because the granularity
*is* the write budget.

**`observedAt` is asserted, not proven.** A prover controls it. Read-time decay
therefore rests on an assertion until a trusted time source exists, and
`TRANSITION_CONTRACT.observedAtIsAsserted` says so rather than leaving it to be
discovered.

Four obligations are the **verifier's**, and no circuit can discharge them: the
nullifier must be spent against a durable set; `prevRoot` must be the head the
verifier holds (a prover supplying an old root forks the history and both
branches verify); `groupRoot` must be independently trusted; and the epoch must
advance on a schedule the verifier controls.

### What mutation testing found here

Nineteen mutations, seventeen killed on the first pass. The two survivors were
both worth the run:

- **A sorted (commutative) node hash survived** every assertion, because the
  multi-event order test compares chains whose inner roots already differ. A
  commutative node hash makes "root R extended by event E" indistinguishable
  from the reverse. Now asserted at the single-append level, where it is visible.
- **The borrowed-member attack survived as a compound mutation** — deleting the
  appender reopen check *and* walking membership from the witness commitment.
  Group leaves are public by construction, so an outsider can always obtain a
  member's commitment and path; the secret is the only thing between them and an
  append. Now has its own fixture.

Two bugs were found before testing, by writing the assertions: `frontier` was
declared in the witness and constrained by nothing (the generic form is now a
test that mutates *every* field the contract declares), and the event encoding
joined its fields with `''`, so `{value: 1, observedAt: '2026…'}` and
`{value: 12, observedAt: '026…'}` produced one commitment with two reopenings.

---

## The portable harness (Priority 5)

`harness-bundle.ts` is what an agent carries between hosts: identity, authority,
reputation, disclosure, hash-pinned skills, and a memory *commitment*.

No-lock-in is not satisfied by "our format is open". It is satisfied when a
receiving host can verify everything the bundle asserts with no network, no
registry, and no cooperation from the issuer. Every part is checkable from the
bundle plus the receiver's own clock.

**The property that matters most: parts cannot be spliced between bundles.**
Each part is individually verifiable, which is exactly why the bundle needs its
own signature over all of them together. Without it, anyone could take agent A's
authority and agent B's reputation — both genuinely signed — and assemble a
harness claiming a score that agent never earned. Every part verifying is not
the same as the bundle being coherent, and that gap is where this kind of format
usually fails.

**A bundle is not a bearer token.** Verifying it establishes what the agent IS,
not what it may do here: the embedded ControlProof is audience-bound, so
presenting a bundle to a service it was not minted for verifies identity and
grants nothing.

Two things it deliberately does not claim:

- **Skills are pinned, not attested.** The bundle carries content hashes and
  says so — it cannot prove the host will *run* that content. The receiver must
  compare each hash against what it loads.
- **Memory travels as a commitment, never contents.** A portable bundle
  carrying memory data is a data-exfiltration shape wearing a portability
  costume. A malformed commitment is refused at pack time rather than accepted
  as opaque bytes.

---

## What this is not

- Not zero-knowledge. Said in the types, not only in prose.
- No revocation registry. Grants expire; they cannot be recalled early.
- Replay defence requires caller-held nonce state; without it the gap is
  reported, not silently passed.
- No on-chain anchoring of control proofs yet.

Intentionally protocol-grade TypeScript: when cargo unblocks, a
`Plonky3ProofProvider` implements the same `IProofProvider` and callers,
key management, and the control-proof shape do not change.
