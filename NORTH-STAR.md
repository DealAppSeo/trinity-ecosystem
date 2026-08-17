# NORTH STAR

**One page. Repo root. If you read nothing else, read this.**

Live numbers are **not** in this file on purpose — run `npm run north`. A page
of hand-copied counts is how the last nine planning surfaces died.

---

## The one sentence

**TrustShell is the trust harness that makes an AI agent's reputation portable:
HAL decides whether the agent is telling the truth, RepID turns that history
into a score, zkRepID makes the score checkable without revealing it, and
x402 + ERC-8004 make it spendable and recordable on someone else's rails.**

If a piece of work does not make that sentence more true, it is not the work.

## The spine — four links, in order

```
  HAL ──────────► RepID ──────────► zkRepID ──────────► x402 / ERC-8004
  is it true?     what's it worth?  prove it privately  spend + record it
```

**zkRepID is canonical as of 2026-08-17** (Sean's decision; `DECISIONS.md` §9 and
`docs/ZKREPID.md` in repid-engine). This link was called "ZKP Postcard" until
then, and the name now points at real code — `src/zkrepid/` in repid-engine, with
the boundary enumerated in `boundary.ts` and pinned by tests.

**The boundary is narrower than "the ZK code".** zkRepID names the six
RepID-specific modules. Poseidon2, Plonky3, hash-agnostic Merkle and the
`zkp-vault` crate stay `zkp` — they are general zero-knowledge machinery that
zkRepID uses, and calling them zkRepID would make the vocabulary worse.

Each link is only as good as the one before it. A ZK proof of a RepID that no
HAL run produced is a proof of nothing — which is the failure mode this whole
codebase keeps re-learning.

**And a fourth failure mode, measured 2026-08-17: a faithful proof of a score
that rewards the wrong thing.** zkRepID is faithful to whatever number RepID
produces, so "the proof verifies" is not evidence that the incentives work. On
the reward-bearing path RepID currently pays *inversely* to quality — a strategy
that tunes its prose just under HAL's flag threshold beats every honest strategy
at every detector accuracy, and no HAL improvement can fix it because the defect
is in the reward curve. Full measurement, and the six anti-gaming properties that
DO hold: `reports/2026-08-17/REPID-INCENTIVE-AUDIT.md` in repid-engine
(`npm run repid:sim`). **Never report link 3 working as link 2 working.**

## Where the priorities actually live

**One place: `trinity_tasks`, filtered by `v_agent_preflight`.** Everything
below is deprecated as a planning surface. They still hold data; they are not
where you look to decide what to do next.

| Surface | Status |
| :-- | :-- |
| `trinity_tasks` (+ `v_agent_preflight`) | **canonical** |
| `autonomous_tasks`, `evergreen_tasks`, `trinity_evergreen_tasks`, `hal_evergreen_tasks`, `ai_task_registry`, `tasks`, `priority_stack`, `trinity_master_plan` | historical — do not add to |
| `SESSION_SUMMARY.md` | last session's handoff, not a plan |
| `docs/SHIP-CHECKLIST.md` | operational order for one release |
| this file | the spine and the gaps |

There were **nine** "what do I do next" surfaces across ~363k task rows when
this was written. That is the reason things get forgotten — not discipline.

## The gap that matters

**⚠ SUPERSEDED 2026-08-15 — the substrate is no longer alive. Read the update
below before acting on this section.**

~~**The substrate is alive. The product surface is four months stale.**~~

~~HAL classifies and RepID scores every single day, in the tens of thousands per
month.~~ But `kya_compliance_receipts` — TrustShell's own output, the artifact
the whole harness exists to produce — was last written **2026-04-01**.

**What changed.** The Trinity fleet went down on Railway at **2026-07-17 22:18
UTC** and has not come back. `trinity_tasks` fell 6,972/day → **4**; HAL events
fell ~2,650/day → 1–2/day, and those are one nightly smoke test
(`e2e_smoke_nightly`, `15 9 * * *`), which is why they all land at 09:15 UTC.
The fleet has been alerting *"Manual redeploy required. Autonomous redeploy
disabled"* every three minutes for 29 days — 9,280 alerts in the last week
alone. Root cause and the four ruled-out candidates:
`docs/GROK-CODE-VERIFICATION-2026-08-15.md` §3a.

**So the gap doubled.** TrustShell is disconnected from its substrate **and the
substrate is switched off.** The redeploy is the precondition for measuring
anything live; the disconnection is still the v1. Build order and lane
parallelism: `docs/PARALLEL-SPRINT-PLAN-2026-08-15.md`.

**This is a live-data claim in a file that grades docs and database only.**
Re-run `npm run north` before trusting either half — if HAL and RepID read LIVE
again, the redeploy landed and this box should be rewritten, not argued with.

## Claims vs. built

Audited 2026-08-12 against the database, not against the docs. **The first two
rows were re-measured 2026-08-16** and both had gone false — they were written
five days before the fleet stopped, and the table outlived the fact. Every other
row still carries its 08-12 verdict and has NOT been re-measured. Re-check with
`npm run north`; the verdicts are here, the counts are not.

| Claim | Where claimed | Verdict |
| :-- | :-- | :-- |
| HAL hallucination filtering | npm, README, sites | **STOPPED 2026-07-18** — re-measured 2026-08-16. Monthly rows: Jun **70,005** → Jul **39,080** → Aug **33**. The cliff is one night: 07-17 **1,360** → 07-18 **2**, and it has not recovered in 30 days. The 1–2/day since are the nightly smoke test. The corpus is real and large; the producer is off. See the superseded section above |
| Portable RepID score | everywhere | **STOPPED, same event** — `repid_score_events` monthly: Jun **70,415** → Jul **39,453** → Aug **114**. Scores are therefore FROZEN, not merely unscored: `EarnedMetrics` decay is time-dependent, so every score reads stale-high the longer this runs |
| Refused trades as the killer feature | HyperDAG README ("160+ refused") | **UNDERSTATED** — the log holds far more refusals than claimed |
| zkRepID proof (was "ZKP Postcard") | HyperDAG README | **BUILT, COOLING** — large proof corpus, but the rate has fallen off. Name canonicalised 2026-08-17 |
| RepID rewards good behaviour | everywhere, implicitly | **FALSE as of 2026-08-17** — measured, not inferred. The reward-bearing path pays inversely to quality: the best-grounded claim is penalised, and a truthful strategy tuned just under HAL's flag threshold wins at every swept detector accuracy. Currently *masked* (not fixed) by `HAL_DECISION_REQUIRES_QUORUM`, which zeroes most deltas while the fleet is down. `reports/2026-08-17/REPID-INCENTIVE-AUDIT.md` |
| x402 settlement | HyperDAG README, handoff | **REAL BUT THIN** — genuine on-chain settlements, low volume |
| ERC-8004 reputation writes | README, badges | **REAL BUT THIN** — genuine writes, low volume |
| Peer verification mesh | handoff | **STOPPED 2026-07-21** — died with the fleet freeze, not a code fault |
| BFT consensus authorizes every transaction | README | **WIRED, NEVER EXECUTED** against real providers |
| Compliance receipts via IPFS + Solana | one-pager | **OVERSTATED** — Solana yes, IPFS no; none issued since April |
| Insurance proportional to RepID | README | **NOT MEASURED** |
| Fireblocks pre-authorisation | README, one-pager | **STUB** — generates the object, calls no Fireblocks API. Honestly labelled in code |
| Package tier (Shamir M-of-N) | HyperDAG README | **ROADMAP** — self-declared as such. Fine |

Two rules this table exists to enforce: **do not soften a claim to match the
build — build the claim or delete it**, and **never let a stale surface look
current**. Both have been broken here before.

## The surface: what TrustShell.dev should be

Ten nav items today. Evidence supports **seven**, and the ordering is wrong —
it leads with Mission when the product is an install.

**Lead with the thing that works.** HAL is the live, enormous, defensible
asset. The first screen should show an agent being caught, with a real audit
chain entry behind it — not a mission statement.

| Keep, in this order | Why |
| :-- | :-- |
| **Connect** | the product is `npm install`; make it the front door |
| **Run** | HAL catching something, live. The demo *is* the pitch |
| **RepID** | the score, and what it unlocks |
| **History** | the audit chain — the receipt that makes it credible |
| **Leaderboard** | social proof, real rows behind it |
| **Agents** | the registry |
| **Settings** | thresholds, keys, posture |

| Cut or gate | Why |
| :-- | :-- |
| **Stake** | effectively dormant. A nav item over an empty room reads as abandonment |
| **Market** | no evidence found. Either wire it or drop it |
| **Mission** | fold into the footer. Nobody installs an SDK because of a mission page |

**The UX principle**, which is the same one the receipts taught us: *every
surface states whether what it shows was measured, not measured, or failed.*
A dash is a lie when it means "we didn't look." Three states, never two —
LIVE / NOT CHECKED / FAILED — on every panel that renders a number.

## Before mainnet — preconditions that are cheap now and expensive later

None of these matter on devnet/testnet. All of them must be true before value
moves on a real chain. Written down here because each one currently looks like
a non-issue, which is exactly how it gets shipped past.

- **Replace the Solana signing keypair.** `AGENT_SOPHIA_PRIVKEY` and
  `AGENT_SOPHIA_SECRET_BYTES` are the *same* keypair — one
  `Keypair.generate()` in `scripts/create-solana-wallet.js` — and the base58
  form is in git history. `SolanaExecutor` still signs with it. On devnet that
  is harmless: the funds are worthless, there is no signature-based auth
  anywhere in the app, and the on-chain compliance memos it writes are never
  read back. Any one of those three changing makes it live. Fix is five
  minutes: regenerate, set `AGENT_SOPHIA_SECRET_BYTES`, delete
  `AGENT_SOPHIA_PRIVKEY`.
- **Stop baking secrets into container images.** `repid-engine`'s Dockerfile
  passes `BASE_SEPOLIA_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as build
  `ARG`/`ENV` (Railway build log flags `SecretsUsedInArgOrEnv`, lines 11-12), so
  a funded wallet key persists in the image layers. Unlike the settled Supabase
  key, this one has **no disabled-key defence behind it**. Read them at runtime
  only.
- **Re-check the memo threat once anything reads memos.** The moment a verifier
  reads compliance memos back from chain — or a counterparty does — a leaked
  signing key can forge RepID and `bft: 1` claims into the audit trail the
  product sells. Write-only memos are why this is currently theoretical.

## Blocked on a human

Live list. Items move to *Done* the moment they are done — a stale blocker list
is how a fleet stays paused for three weeks behind a gate nobody re-read.

1. **Network egress allowlist**: `qnnpjhlxljtqyigedwkb.supabase.co`,
   `repid-engine-production.up.railway.app`, `trustshell.dev`,
   `trustrepid.dev`, `hyperdag.org`, `repid.dev`, `docs.lovable.dev`.
   Set on the Claude Code environment. **Attempted 2026-08-13 and still
   `connect_rejected`** — egress policy appears to bind at container start, so
   a fresh session is the first thing to try. Until this lands, no agent
   session can audit the *shipped* surfaces; this file grades docs and database
   only.
2. **`BASE_SEPOLIA_PRIVATE_KEY` is baked into `repid-engine`'s image** as a
   build `ARG`/`ENV`. A funded wallet key in image layers, with nothing
   disabled standing behind it. The most live credential issue open.
3. **Railway env vars** on the service behind `app.aitrinitysymphony.com`:
   `INTERNAL_ROUTE_SECRET`, `CRON_SECRET`. Without them the BFT worker cannot be
   scheduled and every receipt stays `bft_passed = NULL`.
4. **OAuth Cloudflare + Stripe** from an interactive session — a
   non-interactive session cannot complete the handshake.
5. **Deploy merged `main`, then apply the phase-2 RLS migration**
   (`20260812220000_rls_phase2_after_deploy.sql`). ⚠ In that order. Reversed,
   the agent grid and receipt feed go blank.

### Done — kept so they are not re-opened

- **Legacy Supabase keys** — SETTLED. Disabled project-wide, so the publicly
  leaked `service_role` JWT is inert. Not an incident. One standing rule:
  **never press "Re-enable JWT-based API keys"**. `docs/KEY-ROTATION.md` plus
  the DB's settled facts.
- **Fleet HOLD** — cleared 2026-08-13. `verdict=GO`, `global_pause=false`,
  first time since 2026-07-22. The gate ("rotate the `service_role` JWT") was
  unsatisfiable as written and substantively met. `trinity_changelog` id 111,
  rollback SQL included. *`orphaned_claims` is still 23,113 — the other half of
  the original gate, and it does not block the fleet.*
- **PR #21** — merged as `acc94c8`.
- **Is `repid-engine` public and does it hold the same key?** — yes to both;
  see the settled item above. A 923-commit scan plus seven more public repos
  found no other credential.
- **Ecosystem repos attached, scanned, graphed** — `npm run graph:ecosystem`.
