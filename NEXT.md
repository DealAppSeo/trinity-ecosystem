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

**Measurement that decides whether this pays:** count how many of the 403
`x402_settlements` rows could carry a control proof today. If the answer is
zero, this is a greenfield path, not a migration — and should be built as one.

**2. Nonce store for replay defence.**
`checks.replay` reports `NOT_CHECKED` whenever the caller keeps no nonce state,
which is currently always. Needs a table with a TTL matched to max grant
lifetime. Until it exists, every control proof is replayable within its window
and the system says so.

**3. E2E ledger coverage.**
Add the identity path to `scripts/e2e/run-e2e.mjs` so it is exercised through
HTTP against a real route, not only in unit assertions. The three-outcome ledger
already exists; the identity checks map onto it directly.

---

## Tier 2 — Priority 2 (zkRepID core)

**4. Bind `EarnedMetrics` output into a `ControlProof` predicate.**
`EarnedMetrics.ts` already computes measured scores (trinity-orch 2960,
trinity-tom 2038). The `PredicateStatement` shape accepts it as-is:
`{ predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: <score> } }`.
Honest today (`witnessHidden: false`), zero-knowledge when #75 clears.

**5. Selective-disclosure claim vocabulary.**
`disclosure.ts` accepts arbitrary keys. A fixed vocabulary
(`controller`, `capabilities`, `repId`, `issuedAt`, `exp`, `aud`) makes
disclosures comparable across issuers and is what a verifier can write policy
against. Deliberately deferred: inventing a vocabulary before there is a second
consumer is how schemas get invented rather than discovered — the same reasoning
that declined the `hal_quorum_receipts` migration (Sprint K).

---

## Tier 3 — Priority 4 (sub-agents), unblocked by `capability.ts`

**6. Delegation chains.**
`capability.ts` has the algebra (`permits`, `isAttenuationOf`, `excess`); the
chain artifact does not exist yet. A `DelegatedControlProof` carries its parent,
and verification walks to the root checking, at every link: signature,
`isAttenuationOf(child, parent)`, `expiry <= parent.expiry`, audience match.

Time attenuates too — a child outliving its parent is an escalation, and it is
the one people forget.

**7. Caveats** (`maxValue`, `maxCalls`, `toolAllowlist`). Needs a decision on who
enforces a stateful caveat like `maxCalls`, since the verifier is stateless
today. Do not add the type until that is answered — an unenforced caveat in a
signed grant is worse than no caveat, because it reads as a control.

---

## Blocked — needs Sean

1. **`static.crates.io` on the proxy allow-list** (task #75). Unblocks
   `Plonky3ProofProvider`, `services/zkp-postcard`'s `cargo check`, and the only
   change on this branch with no executed evidence behind it.
2. **Rotate the Base Sepolia deployer key** (task #73). Owns ERC-8004 identities
   3747/3748/3750, in git history. Until then the DID↔agentId binding cannot be
   proven even in principle — a signature from a compromised key proves nothing
   about who controls the agent today.
3. **PR #24 → #25 merge is done**; PR #25 still open.

---

## First three commands for the next session

```bash
npm run check                    # expect exit 0, 438 assertions
node scripts/check-identity.mjs  # expect 57, VERIFIED
git log --oneline -8             # orient on the identity commits
```
