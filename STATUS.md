# STATUS — zkRepID TrustShell identity layer

**Updated:** 2026-08-14 · **Branch:** `claude/zkrepid-agentic-os-jfbi18` · **Gate:** `npm run check` exit 0, 438 assertions

---

## The pivot, and the measurement behind it

Priority 1 as originally briefed ended in "Plonky3 selective-disclosure linking
proof". **Plonky3 cannot be compiled in this environment**, verified this session
rather than assumed:

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
| Replay defence | **VERIFIED when the caller supplies nonce state**, else reported `NOT_CHECKED` |
| `repid >= threshold` **without revealing repid** | **NOT PROVEN** — needs Plonky3 (#75) |
| Agent DID ↔ ERC-8004 `agentId` | **CLAIMED, never proven** — different curves; see below |

The ERC-8004 binding is deliberately `claimed`. The token owner is a secp256k1
EVM address and the DID is Ed25519; neither key can sign for the other. There is
no `proveErc8004Binding` function, and a test asserts there isn't — writing one
that returned `proven` without an owner signature is how `humanCustodyBound`
became an unverifiable boolean in the first place.

---

## Verification

`npm run check` → **exit 0, 438 assertions**, `tsc --noEmit` 0 errors.
`check:identity` → **57 assertions**, stable across 5 consecutive runs.

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

## What this is not

- Not zero-knowledge. Said in the types, not only in prose.
- No revocation registry. Grants expire; they cannot be recalled early.
- Replay defence requires caller-held nonce state; without it the gap is
  reported, not silently passed.
- No on-chain anchoring of control proofs yet.

Intentionally protocol-grade TypeScript: when cargo unblocks, a
`Plonky3ProofProvider` implements the same `IProofProvider` and callers,
key management, and the control-proof shape do not change.
