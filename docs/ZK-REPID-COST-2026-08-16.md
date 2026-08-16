# zk RepID — is it fast? Measured in the only unit that survives Poseidon2

**Date:** 2026-08-16
**Guard:** `npm run check:zk-cost` — 9 assertions, 4 mutations
**Module:** `lib/trustshell/identity/cost.ts` (exported from the barrel)

---

## 0. The finding, in one paragraph

**zk RepID cannot execute in this repo at all**, and separately, **there is no
headroom in its code.** The sole production `IBindingScheme` —
`PendingPoseidon2Scheme` — throws on all three methods, because Poseidon2
parameters belong to the other lane and inventing them is refused. Every
existing zk test therefore runs against a *toy* hash. Measured in hash calls,
the unit that survives that substitution, **every operation is already at its
information-theoretic minimum**: group build is N−1, paths are ceil(log₂N),
verification is 2 + ceil(log₂N). zk RepID's speed is
`optimal_count × cost(Poseidon2)` — and the only remaining variable is not ours.

---

## 1. Why milliseconds are the wrong unit here

`PendingPoseidon2Scheme.commit/nullify/hashPair` all throw
`MISSING_PARAMETERS`. There is no scheme to time. A wall-clock number from the
SHA-256 stand-in used in tests would describe a hash we will never ship, and
would change by an order of magnitude the moment the real one arrives.

The unit that survives is the **hash call count**. Every operation in this layer
is a composition of `commit`, `nullify` and `hashPair`; the eventual cost is
`count × cost(Poseidon2)`, and in a circuit the *constraint* count is dominated
by the same number. Counting calls today answers the performance question, and
the answer stays correct when the parameters land.

That is what `lib/trustshell/identity/cost.ts` measures.

---

## 2. Measured, against the bound

`COST_MODEL` states the **optimum** — not a recording of current behaviour, so
the suite compares the implementation against the bound rather than against
itself. A model that echoed the measurement would ratify any regression the
moment somebody re-recorded it.

| operation | measured | bound | at optimum? |
|---|---|---|---|
| `buildGroup(N)` | N−1 `hashPair` | a Merkle tree over N leaves has exactly N−1 internal nodes | **yes** |
| membership path | ceil(log₂N) | one sibling per level | **yes** |
| `buildBindingStatement` | 1 commit + 1 nullify, **constant in N** | the path is supplied, not recomputed | **yes** |
| `verifyBindingByRecomputation` | 1 commit + 1 nullify + ceil(log₂N) | reopen, re-nullify, walk | **yes** |
| `commitEvent` | 1 commit | one commitment over the fields | **yes** |
| `appendEvent` | 1 `hashPair` | one node folding the event into the root | **yes** |

Verified at N ∈ {2, 4, 8, 16, 64, 1024, 4096}.

**Each of verification's three components is load-bearing** — this is a floor,
not a budget:

- drop the reopen → the witness commitment is unconstrained;
- drop the nullify → a replay is undetectable;
- drop the walk → membership is *asserted* rather than *checked*.

So **"make zk RepID faster" cannot be done in this repository's code.** The
count is optimal; the primitive is cross-lane.

---

## 3. The property no functional suite can see

Membership verification is **O(log N)**. A refactor that rebuilds the root from
the whole group instead of walking the path is still *correct* — same booleans,
same rejections — and passes every assertion in `check:identity`. It is also
**O(N)**: at a group size of 4,096 that is 341× the work, and in circuit terms
the difference between a proof that fits and one that does not.

Complexity is invisible to a functional test. `check:zk-cost` makes it visible:

```
verify at N=64   →  8 calls
verify at N=4096 → 14 calls      (64 squared: the count ADDS, it does not multiply)
an O(N) verifier →  ~4,098 calls
```

The mutation that proves this bites is the security-relevant one: it keeps the
loop, keeps the comparison, and simply sets the node to the claimed root — so
**every boolean stays identical and only the hash count betrays it.** That is
the borrowed-member attack surface, caught by a cost assertion.

---

## 4. One mutation recorded and NOT counted

Changing `buildGroup`'s stride from `i += 2` to `i += 1` **does not terminate**:
each level stays the same length, so the `while` never shrinks. It compiles, and
it hangs.

Rule 4 says a mutation that does not compile is not evidence. A mutation that
does not *terminate* is not evidence either — it fails the suite by timeout,
which is indistinguishable from a broken harness. **Recorded here, not
registered.** The registered version hashes each node twice, terminates, and is
CAUGHT.

---

## 5. Security posture, stated plainly

Two things are true at once and are easy to conflate:

- **`provenWithoutSecret` is `false` on every recomputation path**, always. The
  return type refuses to let a caller pretend otherwise. This is honest-prover
  binding — real evidence, but only to a verifier who legitimately holds the
  secret.
- **`WebCryptoProofProvider.witnessHidden` is `false`**, always. A commitment
  can *bind* a value; it cannot *hide* one. Verifying `commit-sha256:<h>` opens
  to `repid=3723` requires the preimage. There is no third option with hashes
  alone — a SNARK is what buys it, and that is why the seam is an interface
  boundary rather than a config flag.

So **there is no zero-knowledge in zk RepID today.** The naming is aspirational;
the types are honest. Both facts should travel together in any external claim.

Unlinkability, separately, is **bounded by group size** and that number must be
reported with any privacy claim — `describeAnonymitySet()` exists for exactly
that, and `MIN_MEANINGFUL_GROUP` is 2.

---

## 6. NOT CHECKED — with the condition that would settle each

| item | why not checked | what would settle it |
|---|---|---|
| **Real Poseidon2 cost per call** | parameters are the other lane's; inventing them is refused, and a guessed set produces values that look correct and pass | the parameter set (**cross-lane, XAI**) — then cost is `count × cost`, with count already pinned here |
| **Circuit constraint count** | no circuit is compiled in this repo | the Plonky3 path, blocked on task #75 (cargo) |
| **Whether `witnessHidden` ever becomes true** | requires the SNARK provider, not a faster hash | task #75 |
| **End-to-end wall-clock** | no production scheme executes | a redeploy plus real parameters; until then any figure is about the toy |
| **Group sizes in production** | no live group is built anywhere | a caller — `buildGroup` has no production caller, the same "reachable is not running" state as the spine |

---

## 7. What changed in the repo

- `lib/trustshell/identity/cost.ts` — `countingScheme`, `COST_MODEL`,
  `totalCalls`, `verifyGrowth`. Exported from `lib/trustshell/index.ts`.
- `scripts/zk-cost-test.mjs` — **9 assertions**, including that the production
  scheme throws, that the counter delegates rather than measuring itself, and
  that verification is O(log N).
- **4 mutations** registered (47 → 51 CAUGHT), one recorded as non-terminating
  and deliberately not registered.
