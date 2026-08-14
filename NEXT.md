# NEXT — highest-leverage remaining work

Ordered by leverage, hardest-first within each tier. Written so the next session
can start without re-deriving context. See `STATUS.md` for what is already built
and `docs/PRIOR-WORK-INDEX.md` before starting anything.

---

## Tier 1 — finishes Priority 1 end to end

**1. Wire `ControlProof` into the live payment path.**
`app/api/trustrails/pay/route.ts` currently authorizes on `agentName` plus a
registry lookup. The gap: nothing checks that a *human* authorized this agent.

- Accept an optional `controlProof` on the request.
- Verify with `audience: 'trinity:pay'`, `requiredCapabilities: ['pay:<asset>']`.
- Feed the result into `KYAValidator` as a new signal — do **not** replace the
  existing gate in the same change; run them side by side first and measure
  disagreement, or the first failure will be indistinguishable from a bug.
- `humanCustodyBound` in `ZKPAttestation` becomes derived from a verified proof
  instead of read from a registry row.

**Measurement — RUN, answer: greenfield.** `x402_settlements` has no controller
column at all, and `agent_kya_registry.custodian_zkp_proof` is NULL in all 12
rows. There is no existing proof to migrate, so build this as a new path rather
than a migration. Full finding in LESSONS A11.

**2. Nonce store — DONE in memory, BLOCKED durably.** `NonceStore.consume` is
atomic and wired into the verify route, and replay is proven caught over HTTP.
Cross-instance defence needs
`supabase/migrations/20260814090000_control_proof_nonces.sql`, written and
deliberately **unapplied** — applying to the live project is Sean-gated. Until
then the ledger records `control_proof_replay_across_instances` as NOT CHECKED
rather than implying full protection.

**3. E2E ledger coverage — DONE.** Seven identity steps run against a real
handler over HTTP; two are core, paired so the gate must be shown to both open
and close.

---

## Tier 2 — Priority 2 (zkRepID core)

**4. Bind `EarnedMetrics` into a predicate — DONE** (`repid-predicate.ts`).
Evidence quality (`fullyMeasured`, `measuredSignals`, `weakestConfidence`)
travels in `publicInputs` so a verifier can distinguish a well-evidenced pass
from a thin one; the score stays in `privateWitness`. A non-positive threshold
is refused, because an unevidenced agent scores exactly 0 and would clear it.

**4b. Nullifier ↔ commitment contract — DONE, blocked on parameters**
(`nullifier.ts`). The statement/witness shape and `CIRCUIT_CONTRACT` are
written; the Poseidon2 scheme deliberately throws until the other lane supplies
field, width, rounds, constants, matrices, absorption order and test vectors.
See `docs/POSEIDON2-PARAMETER-REQUEST.md`. **This is the top open item.**

**5. Selective-disclosure claim vocabulary.**
`disclosure.ts` accepts arbitrary keys. A fixed vocabulary
(`controller`, `capabilities`, `repId`, `issuedAt`, `exp`, `aud`) makes
disclosures comparable across issuers and is what a verifier can write policy
against. Deliberately deferred: inventing a vocabulary before there is a second
consumer is how schemas get invented rather than discovered — the same reasoning
that declined the `hal_quorum_receipts` migration (Sprint K).

---

## Tier 3 — Priority 4 (sub-agents), unblocked by `capability.ts`

**6. Delegation chains — DONE** (`lib/trustshell/identity/delegation.ts`).
Capability, audience, time and start-time all attenuate per link; subject
continuity, possession and a depth bound are enforced. See STATUS.md.

Still open on top of it: expose chains through the verify route, and decide
where a chain is *stored* when a supervisor spawns a worker mid-task.

**7. Caveats** (`maxValue`, `maxCalls`, `toolAllowlist`). Needs a decision on who
enforces a stateful caveat like `maxCalls`, since the verifier is stateless
today. Do not add the type until that is answered — an unenforced caveat in a
signed grant is worse than no caveat, because it reads as a control.

---

## Blocked — needs Sean

1. **Rotate the leaked deployer key** (`autonomous_tasks` #73) — the only item
   with a standing window of exposure. The runbook is written and pre-flighted:
   `scripts/rotate-erc8004-deployer.mjs`, dry-run by default, verifies by
   re-reading `ownerOf` rather than trusting receipts.

   Verified on-chain 2026-08-14: **not yet exploited** — nonce, balance and every
   affected `ownerOf` unchanged since discovery. Affected identity ids are in
   task #73, not here. Until this is done, the DID↔agentId binding cannot be
   proven even in principle: a signature from a compromised key proves nothing
   about who controls the agent today.

2. **`static.crates.io` on the proxy allow-list** (task #75). Unblocks
   `Plonky3ProofProvider`, `services/zkp-postcard`'s `cargo check`, and the only
   change on this branch with no executed evidence behind it.

3. **Poseidon2 parameters from the repid-engine lane** — hand over
   `docs/POSEIDON2-PARAMETER-REQUEST.md`. Blocks the real binding scheme; the
   contract and tests are already written against it.

4. **`ControlProof` → `VaultPermission`: SHADOW MODE BUILT, awaiting data.**
   `lib/trustshell/CustodyShadow.ts` observes at the custody gate and changes
   nothing. Run `SHADOW_ANALYSIS_SQL` after it has been live a while.

   **Read `not_comparable` first.** Nothing presents a ControlProof to the vault
   path yet, so early observations will be almost entirely that. It is the
   measurement — it says adoption is zero — not a sign the two approaches agree.

   The cutover decision needs `shadow_looser` to be zero or fully understood:
   that is the direction where switching GRANTS access the live gate currently
   refuses. `shadow_stricter` only tightens, which is recoverable.

5. **PR #25** is open; #24 is merged.

---

## First three commands for the next session

```bash
npm run check                    # expect exit 0, 448 assertions
node scripts/check-identity.mjs  # expect 104, VERIFIED
npm run test:e2e                 # expect 26 VERIFIED, 0 FAILED, core 10/10
git log --oneline -8             # orient on the identity commits
```
