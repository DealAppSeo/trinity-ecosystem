# Minimal ERC-8004-compatible attestation — proposal, not a build

Written 2026-08-19. Item B of the same instruction that produced items A/C/D/E
on `claude/v1-spine-authority-collateral`. **Research + proposal, shadow/observe
only.** Nothing here calls a chain, nothing gates the pay route, and nothing in
`DealAppSeo/hyperdag-protocol` was written to — `ERC8004SPEC.md`, `contracts/`,
`test/`, `abis/` are Marco De Rossi's and were read-only for this work, per the
standing hard stop.

Two things were asked for: (1) an attestation for `soft_landing`/axis-range
claims, in the direction the passport schema already points; (2) an attestation
that "this reward/pay decision used real collateral + a contracted
(independent) evaluation." Both are asked to **compose with ERC-8004
Validation hooks over a new chain**, and to record attestation presence as
`MEASURED | NOT_CHECKED | FAILED` rather than a pass/fail badge.

The honest finding, ahead of the detail below: **the two proposed attestations
are NOT symmetric.** #1 needs a capability neither this repo nor
hyperdag-protocol currently has working. #2 needs no new cryptography at all —
it can be built from mechanisms that already exist here today. Treating them
as one feature would have hidden that difference; they are kept separate for
that reason through the rest of this doc.

---

## 1. What the Validation Registry actually is (read-only research, hyperdag-protocol)

Source: `ERC8004SPEC.md:343-398`, `contracts/ValidationRegistryUpgradeable.sol`,
`abis/ValidationRegistry.json` — all read, none written.

- **Request/response, not a staked-attestation hook.** `validationRequest(validatorAddress, agentId, requestURI, requestHash)` — callable only by the agent owner/operator (`ValidationRegistryUpgradeable.sol:88-96`). `validationResponse(requestHash, response uint8 0-100, responseURI, responseHash, tag)` — callable **only by the exact `validatorAddress` named in the request** (`:125`, `require(msg.sender == s.validatorAddress)`). There is no validator self-registration anywhere in the contract.
- **The "hook" for a third party (trinity-ecosystem) is that `validatorAddress` parameter, and nothing more.** No allowlist, no permissionless push, no callback interface. An agent owner names a TrustShell-controlled address as validator; only that address may later respond. That is the entire integration surface — confirmed by grep across the repo: no `IValidation.sol`, no adapter interface exists anywhere on `main`.
- **Typing is one free-form `string tag`.** No schema-id field on request or response (contrast the Identity Registry, which does carry a `"type"` URI — `ERC8004SPEC.md:58`). The spec's own precedent for a two-stage claim is a *progressive tag on repeated calls to the same `requestHash`* — `"soft_finality"` → `"hard_finality"` (`ERC8004SPEC.md:375`, exercised in `test/core.ts:1848-1889`). This is the closest existing analog to a staged claim and is reused below.
- **Staking / value-at-risk is explicitly delegated OUT of this contract.** `ERC8004SPEC.md:398,427`: "Incentives and slashing related to validation are managed by the specific validation protocol... outside the scope of this registry." No stake, bond, or economic-security field exists in the on-chain `ValidationStatus` struct. This is a feature for this proposal, not a gap: De Rossi's tiered-trust-proportional-to-value-at-risk stays exactly where this repo already keeps it — off-chain, in `authority-policy.ts`'s `A_eff` — rather than needing to be re-expressed on-chain.
- **Not confirmed live on any public chain.** The per-chain address tables in `hyperdag-protocol/README.md` and `packages/contracts/README.md` (~18 networks) list `IdentityRegistry` and `ReputationRegistry` addresses; `ValidationRegistry` appears in **neither table**. A deterministic CREATE2 "vanity" address exists (`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`) but is only exercised against local Hardhat (chain id `31337`) in that repo's own tests. Treat it as reserved/deployable-to, not live.
- **No SDK wrapper exists either.** `packages/defaults/identity-erc8004-viem` — the one published client package — exports `IDENTITY_REGISTRY_*` and `REPUTATION_REGISTRY_*` constants and read-only reputation calls; it has **no `VALIDATION_REGISTRY_*` constant** and its own `abi.ts` names only the Identity/Reputation ABIs as what it wraps. A caller would hand-roll calls against the raw ABI today.

**Consequence for "compose over a new chain":** hyperdag-protocol's own docs state no explicit "don't build a competing registry" policy (checked directly — genuinely absent, not asserted here), but composing is still the right call on the merits: there is nowhere near enough settled surface here to justify a parallel chain, and the spec itself says the Validation Registry "is still under active update and discussion with the TEE community" (`packages/contracts/README.md:269-271`) and will be revised. Building against a moving, not-yet-deployed target is a reason to stay light (`README.md:12`: "Replace any layer you want; keep the rest"; `:207`: "Adopt only the layers you need"), not a reason to fork it.

## 2. What NOT to imitate: `x402PaymentProof` on the Reputation Registry

hyperdag-protocol's own `ReputationRegistryUpgradeable.sol` already carries an
on-chain field for exactly the flavor of claim item (2) below asks for — and
it is the wrong pattern to copy. `NewFeedback`/`giveFeedback` take a `bytes
x402PaymentProof` (`ReputationRegistryUpgradeable.sol:27,51,106,127,136`), and
`:230-233` gives it real effect: **a non-empty proof blob doubles the
feedback's weight** in `getSummary()`, with **no verification of the blob's
contents whatsoever** — not that the payment was real, not that it was for
this task, not that collateral behind it existed. hyperdag-protocol's own
`README.md:42` flags this as an undocumented, spec-deviating contract defect
(the extra 12th parameter also breaks canonical event-topic filtering for any
compliant indexer). It is cited here because it is the closest existing
on-chain precedent for "a payment happened → count it" — and it is a
cautionary example, not a template. Anything trinity-ecosystem submits under
either proposal below must carry a checkable claim, not an opaque blob that
gets trusted by its mere presence.

## 3. Correcting an assumption before proposing anything: `lib/trusttrader/`

`lib/trusttrader/ValidationRegistry.json` and `IdentityRegistry.json` are
already vendored in this repo (full ABIs, 505 and 1044 lines). Before writing
this proposal it would have been easy to assume that means a live caller
already exists. It does not: `lib/trusttrader/trade_pipeline.ts` (the only
consumer of that directory's `eip712.ts`/`merkle.ts`) does EIP-712 signing of
`TradeIntent`/`ConstitutionalRefusal` and Merkle commitments, and writes to
`agent_repid`/`trade_execution_log`/`repid_merkle_events` — **it never calls
`validationRequest`, `validationResponse`, or `getValidationStatus`**,
confirmed by a repo-wide grep for all three names returning zero matches
outside the ABI JSON files themselves. The ABIs are vendored, unused. Nothing
below assumes they are wired to anything.

## 4. Proposal #1 — `soft_landing` / axis-range attestation: BLOCKED, honestly

The passport schema already has the shape this would fill:
`ZKPPassportDisclosure.verification_axis.soft_landing_active` (boolean, plain
JSON, `docs/contracts/events.v1.json:164-176`) and `axis_scores` (five 0-100
numbers, same schema). A genuine attestation would let a counterparty learn
"this agent's axis score is in range X" (or "soft landing is active") without
learning the exact score — this needs the witness genuinely **hidden**, not
merely committed.

This repo already has the right interface for it —
`lib/trustshell/identity/proof-provider.ts`'s `IProofProvider`, with a
`PredicateStatement{predicate:'gte', publicInputs, privateWitness}` and a
`ProofResult.witnessHidden` flag that is **mirrored from the provider, not the
individual proof**, specifically so a caller can never launder a
commitment-only proof into a privacy claim. The `gte` predicate is exactly
"axis score ≥ threshold"; a two-sided range needs two `gte` statements
(`score ≥ min` and `threshold_max ≥ score`, i.e. `max - score ≥ 0`), not a new
predicate type.

**But today, `witnessHidden` is `false` for every provider actually available:**

- This repo's own `WebCryptoProofProvider` is commitment-only by construction — its header states plainly "a hash commitment cannot be made zero-knowledge by improving this class." The real one (`system: 'plonky3'`) is blocked on task #75 (`static.crates.io` absent from this sandbox's proxy allowlist) — an existing, already-tracked blocker, not a new finding.
- hyperdag-protocol's own ZK tooling is in the same state, independently: `packages/circuits/reputation_proof.circom` is a **one-sided** `GreaterEqThan` stub (no `max_points` input — not even a range proof shape yet) that its own directory README calls explicitly non-production, falling back to "a compatible simulation when the actual circuit files aren't available." `Groth16Verifier.sol` is a placeholder (`return pA[0] != 0`) and — confirmed by grep — is not imported or called by anything else in that repo, including the Validation Registry.
- Trinity's own `RepIDRegistry.sol` inside hyperdag-protocol (`packages/contracts/src/reputation/RepIDRegistry.sol:33-45`) already carries a Pedersen-commitment hook explicitly intended for pairing with a ZK proof — also unwired to any verifier. This is the best-positioned future landing spot (it is already Trinity's own contract, already on the Reputation Registry, already commitment-shaped) but it does not change the verdict today.

**Verdict: BLOCKED, on both sides of the composition, independently.** Minting
a "range proof" from a commitment-only provider and calling it private would
repeat the exact mistake `proof-provider.ts`'s own header warns against — "the
previous version of this system... labelled a SHA-256 of a timestamp `groth16`
and published it on-chain." The correct action now is to not submit anything
under this heading, and say so honestly in the attestation-presence record
(§6) rather than fabricate a proof shape neither side can back yet.

## 5. Proposal #2 — collateral + contracted-eval attestation: buildable now, off-chain

Unlike #1, this claim is **not a secret value that needs hiding** — it is a
claim about which process ran ("was the collateral real, was the evaluator
independent"), and those facts are already computed, honestly, elsewhere in
this repo:

- `lib/trustshell/collateral.ts` — `CollateralOutcome = 'MEASURED' | 'NONE' | 'NOT_CHECKED'`, already exercised live on this branch (item 1, `scripts/exercise-collateral-live.mjs`).
- `lib/trustshell/verifier-independence.ts` — `Independence = 'DISJOINT' | 'SHARED_FAMILY' | 'NOT_CHECKED'`, already exercised against a real claim on this branch (item 2, `scripts/exercise-promotion-attribution.mjs`).
- `app/api/trustrails/pay/route.ts`'s `evaluateContractedPayment`/`mayApproveAfterContract` — the live gate these two facts already feed.

So the minimal attestation is: **sign a claim over these two already-computed
outcomes**, using the dual-signature `ControlProof`/`AuthorizationGrant`
machinery this repo already has (`lib/trustshell/identity/control-proof.ts`) —
audience-bound, caveat-bearing, offline-verifiable, no registry or network
needed to check it. No new cryptography, no blocked prover. What would be new:
a small, named record type that says which two facts it is attesting to and
what the honest verdict is when either is not yet real — built in §6.

**Composition with the Validation Registry, when a live address exists (not
yet — see §1):** submit as a `validationResponse` on the request the payer's
agent owner already made, with a namespaced `tag` (`trustshell:collateral-eval:v1`),
`response` (0–100) computed **only** from the two real outcomes above (100 only
when collateral is `MEASURED` real **and** independence is `DISJOINT`; a
partial or self-verified state must score low, never 100 — this is exactly the
distinction the `x402PaymentProof` anti-pattern in §2 fails to make), and
`responseHash` a commitment over the actual signed `ControlProof` artifact so
the on-chain record is checkable rather than an opaque blob.

## 6. What shipped this session: a shadow presence record, nothing else

`lib/trustshell/attestation-presence.ts` (new, zero-imports — same convention
as `promotion.ts`/`collateral.ts`/`lane-files.ts`, "a decision that ends up in
a status table must be runnable standalone"). It does not call a chain, does
not sign anything, and is not wired into the pay route. It takes the two
already-computed facts above (structurally, not by importing their modules —
same reason `promotion.ts` never imports `verifier-independence.ts`) and
reports:

- `describeCollateralEvalAttestationPresence(...)` → `'MEASURED'` only when
  collateral is really `MEASURED` and independence is really `DISJOINT`;
  `'NOT_CHECKED'` when either input itself is `NOT_CHECKED`; `'FAILED'` when
  collateral is confirmed `NONE` or independence is confirmed `SHARED_FAMILY`
  — a confirmed negative is not the same as an unmeasured one, same reasoning
  as `CollateralOutcome` itself.
- `describeSoftLandingRangeAttestationPresence(...)` → structurally can never
  return `'MEASURED'` while `witnessHidden` is `false`, which is enforced in
  code, not left to caller discipline — matching §4's verdict mechanically
  rather than only in prose.

Exercised against this session's own real facts in
`scripts/exercise-attestation-presence.mjs`: collateral is `NOT_CHECKED` on
this branch (item 1's live Supabase call is proxy-blocked in this sandbox —
not a code failure), and independence is self-verified (item 2). The honest
combined presence today is therefore `NOT_CHECKED` for #2 and structurally
`NOT_CHECKED`/`FAILED` for #1 — printed, not asserted otherwise.

## What this doc does NOT establish

- It does not deploy, call, or confirm liveness of any hyperdag-protocol
  contract — §1's "not confirmed live" finding is from that repo's own docs,
  not a new chain query.
- It does not build a Plonky3 or Circom prover, and does not shorten task #75.
  Proposal #1 stays BLOCKED after this doc, on purpose.
- It does not wire `attestation-presence.ts` into the pay route, `GateRun`, or
  any promotion claim — it is a standalone, exercised, unused-by-production
  module, same stage `CollateralRepository.ts` and `verifier-independence.ts`
  were in before their own first real callers landed.
- It does not change `lib/trusttrader/*` — §3's finding is reported, not
  fixed; that subsystem's own `agent_repid` table usage is a separate,
  pre-existing question this doc does not open.
- It does not claim hyperdag-protocol has a stated "compose, don't fork"
  policy — checked for directly (§1) and genuinely not found; the
  recommendation to compose rests on the merits argued above, not on a quoted
  rule.
