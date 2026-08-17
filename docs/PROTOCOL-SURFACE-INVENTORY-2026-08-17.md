# Protocol surface inventory — what runs, what is merely reachable, and what is a name

**Measured 2026-08-17** against this repo at `42af5e1` and the live database.
Deliverable (a) of three; (b) harness portability and (c) protocol selection
follow, and (c) should not be argued before this.

The question was *"do all the surfaces work well together?"* That cannot be
answered until each surface is classified, because **most of them are not
surfaces yet.**

---

## 0. Method, and the three outcomes

`#52`/`#55` established the distinction this inventory uses. It is not
`implemented / not implemented`:

| verdict | test |
|---|---|
| **RUNNING** | a production surface (an `app/**/route.ts`, or a database trigger) reaches it |
| **REACHABLE** | it has a caller in `lib/` or a check suite, but no production surface reaches it |
| **NAMED ONLY** | it appears in types, prose, or a metric name, with no executable implementation here |

Measured by tracing imports from all **17** `route.ts` files, then transitively
through `lib/`, then confirming against row counts in the database. Nothing below
is inferred from a filename.

---

## 1. The headline: weight and evidence are close to inverted

`DEFAULT_WEIGHTS` in `lib/trustshell/repid-scoring.ts` against the observations
that actually exist in `v_agent_earned_observations`:

| signal | weight | rows | agents | verdict |
|---|---|---|---|---|
| `bft` | **0.40** | **0** | **0** | **no evidence at all** |
| `integrity` | 0.30 | 152,157 | 104 | abundant |
| `x402` | **0.15** | **84** | 11 | negligible |
| `latency` | 0.10 | 218 | 80 | thin |
| `humanCustody` | 0.05 | n/a | n/a | a flag, not an observation |

**The largest weight in the RepID score has never had a single observation.**
`unmeasured` scores zero and `PRIOR_VALUE` is 0, so **40% of every RepID score is
structurally zero** — not low because agents perform badly, but because the
evidence channel does not exist.

`x402` at 84 rows across 11 agents carries **1.5×** the weight of `latency`,
which has 2.6× the rows.

---

## 2. Per-protocol classification

| protocol | verdict | where | evidence |
|---|---|---|---|
| **BFT** | **RUNNING, zero output** | `lib/trust/BFTEngine.ts`, 2 routes | `bft_payment_evaluations` **0 rows**, `prediction_consensus` **0 rows** |
| **MCP** | **RUNNING** | `lib/mcp/{jsonrpc,server,fleet}`, `app/api/mcp/fleet` | route reaches it directly |
| **DID / control-proof** | **RUNNING** | `lib/trustshell/identity/{control-proof,delegation,nonce-store}` | `app/api/trustshell/control-proof/verify` |
| **RepID scoring** | **RUNNING** | `lib/trustshell/repid-scoring.ts`, `EarnedMetricsRepo` | `app/api/trustrails/pay` |
| **HAL (chain/receipt)** | **REACHABLE** | `lib/trustshell/hal-chain.ts`, `hal-receipt.ts` | re-exported by `trustshell/index`; no route calls them |
| **HAL (accuracy)** | **REACHABLE — measurement only** | `lib/hal/accuracy.ts` | imported by `scripts/` **only**. The detector itself is not in this repo |
| **zkRepID** | **CANNOT EXECUTE** | `lib/trustshell/identity/nullifier.ts` | sole `IBindingScheme` throws on all three methods |
| **x402** | **NAMED ONLY** | a metric name | **zero** HTTP 402 handling anywhere in `app/` or `lib/` |
| **ERC-8004** | **NAMED ONLY (a seam)** | `identity.ts` `Erc8004Binding` | a type recording a claim; `proveErc8004Binding` is pinned **undefined** by its own test |
| **hyperdag** | **NAMED ONLY** | 1 file | no module |

---

## 3. The three that matter most

### BFT — runs, persists nothing, and carries the biggest weight

`BFTEngine` is reached by two routes and writes to `autonomous_tasks`,
`prediction_consensus` and `agent_repid`. Two of those three tables are **empty**.
So this is not an unplumbed-data problem that a view could fix: **there is no
data.** The 0.40 weight is not waiting on wiring, it is waiting on the engine
ever having produced an evaluation.

### HAL — the detector is not in this repo

`lib/hal/` contains exactly `accuracy.ts` and fixtures, and is imported by
`scripts/hal-accuracy-test.mjs` and `scripts/mutations.mjs` and **nothing else**.
It measures HAL; it is not HAL. The detector runs in `repid-engine` on Railway,
which is why every HAL finding this month (#64, #65, #74, #79) came from querying
`hal_runner_results` rather than from calling code here.

**Consequence for (c):** "ship HAL as a protocol" currently means shipping a
measurement module and an external service that has been down since 2026-07-17.

### x402 — 15% of the score, and not implemented

There is **no HTTP 402 handling in the repository**. `x402SuccessRate` is a
weight name in `repid-scoring.ts` and a signal string in a view. `ethers` and
`viem` are dependencies, so the on-chain capability exists; the payment protocol
does not.

---

## 4. ERC-8004 — a seam, honestly labelled

`Erc8004Binding` binds a DID to an on-chain agentId, and `identity.ts` says so in
its own header: *"the ERC-8004 seam."* Its test asserts

```js
assert.equal(typeof identity.proveErc8004Binding, 'undefined', …)
```

— i.e. **it pins the absence of a proof function**. That is the correct way to
record an unbuilt capability, and it is why this is REACHABLE-as-a-claim rather
than NAMED ONLY in the pejorative sense. There is no `contracts/` directory in
this repo; per #66 the identities were minted on Base Sepolia from elsewhere.

---

## 5. The six `.dev` domains

`TrustShell.dev`, `TrustMarket.dev`, `TrustRepID.dev`, `TrustRails.dev`,
`TrustTrader.dev`, `TrustCRE.dev` appear in exactly three files —
`NORTH-STAR.md`, `prompts/XC.md`, and `docs/FULL-STACK-E2E-ASSESSMENT-2026-08-14.md`.

**None has a route, a module, or a deployment in this repo.** `lib/trusttrader/`
exists (EIP-712 helpers) and `app/api/trustrails/**` is the largest route family,
so two of the six have code adjacent to them. The other four are names.

This is not a criticism — a north star is allowed to be ahead of the build. It
does mean **"make all six surfaces work together" is not a verification task
today**; there is one deployed product surface, and it is `trustrails`.

---

## 6. NOT CHECKED

- **Whether anything outside this repo consumes these surfaces.** `repid-engine`
  and the Railway fleet are separate deployments; this inventory covers the repo
  and the database only.
- **Whether `bft_payment_evaluations` was ever populated and truncated.** Zero
  rows today; history not examined.
- **The `services/` directory.** `anfis-routing-service`, `mcp-a2a-gateway` and
  `zkp-postcard` were not traced beyond `zkp-postcard`'s dependency graph.
- **zkp-postcard does not build here** — `static.crates.io` is absent from the
  sandbox proxy allowlist (`index.crates.io` is present), so cargo resolves the
  index and 403s on every tarball. That is NOT_CHECKED, not a failure. Its
  `Cargo.lock` pins Plonky3 at `6374a36ff50fc641821513852263cc61ca7a1278`, so a
  runner with crates.io access can reproduce it exactly.

## 7. Reproduction

```bash
# §1 route → lib roots
for f in $(find app -name route.ts); do echo "$f"; grep -oE "from '@/lib/[^']+'" "$f"; done

# §2 x402 has no protocol implementation
grep -rn "402" --include="*.ts" app/ lib/ | grep -iE "status|NextResponse|payment required"

# §2 lib/hal is imported by scripts only
grep -rn "lib/hal/" --include="*.ts" --include="*.mjs" . | grep -v node_modules
```

```sql
-- §1 weights vs evidence
select signal, count(*) rows, count(distinct agent_id) agents
from v_agent_earned_observations group by 1 order by rows desc;

-- §3 BFT persists nothing
select 'bft_payment_evaluations' t, count(*) from bft_payment_evaluations
union all select 'prediction_consensus', count(*) from prediction_consensus;
```
