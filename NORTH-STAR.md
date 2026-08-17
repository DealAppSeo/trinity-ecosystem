# NORTH STAR

**One page. Repo root. If you read nothing else, read this.**

> ## ⇒ CURRENT SPRINT: `docs/SPRINT-DECISIONS-2026-08-17.md`
> **Owner-issued, canonical, and it supersedes anything below that conflicts.**
> Five decisions and a hard-ordered P0–P5. If you are a lane starting work,
> read that file first — the spine below is still right, but four of its
> properties are known-untrue today and are this sprint's work:
> **dual-auth, selective disclosure, issuer-staked reputation, and a ratchet
> that decays unless re-earned.**

Live numbers are **not** in this file on purpose — run `npm run north`. A page
of hand-copied counts is how the last nine planning surfaces died.

---

## The one sentence

**HyperDAG Protocol is the portable, weighted + earned trust harness:
HAL decides whether the agent is telling the truth, RepID turns that history
into a score, zkRepID makes the score checkable without revealing it, and
x402 + ERC-8004 make it spendable and recordable on someone else's rails.**

**Three of those four links do not yet hold, and saying so is the point of this
file.** Measured 2026-08-17 (#83): the ZK proof cannot be produced — the sole
`IBindingScheme` throws — so `witnessHidden` and `provenWithoutSecret` are
permanently false; x402 has **no HTTP 402 handling anywhere**; and ERC-8004 is a
typed seam whose own test pins `proveErc8004Binding` as `undefined`. HAL runs,
but not in this repo. **Quote the sentence as a target, never as a description.**

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
produces, so "the proof verifies" is not evidence that the incentives work. The
reward-bearing path *did* pay inversely to quality — a strategy tuning its prose
just under HAL's flag threshold beat every honest strategy at every detector
accuracy, and no HAL improvement could fix it because the defect was in the reward
curve. **FIXED 2026-08-17** (the clean branch now consumes quality): honesty wins
at every swept combination, and the guard is a test rather than a note. Full
measurement, the fix, and two things it did NOT resolve — throughput now dominates
the top of the table, and ZK statements over pre-fix deltas will no longer verify:
`reports/2026-08-17/REPID-INCENTIVE-AUDIT.md` in repid-engine (`npm run repid:sim`).
That second item is now **partly measured**: **10,627** stored deltas fail a
recompute (7.0% of the ledger, not all of it), and **0** carry an EAS attestation,
so nothing on-chain asserts a stale delta. The ZK exposure itself is **NOT
CHECKABLE** — `repid_score_events.zk_proof_id` resolves to no proof row (uuid vs
bigint, and the one linking column is NULL for all 79,062 proof rows), which
independently agrees with #83 above. `reports/2026-08-17/LEDGER-VERDICT-REACHABILITY.md`.
**Never report link 3 working as link 2 working.**

## The target vocabulary — five terms, with status

**Added 2026-08-17 because these words appeared in almost none of the docs the lanes read.**
Measured before writing: *earned trust*, *issuer-staked* and *decay-unless-re-earned* appeared
in **zero** docs across both repos; *selective disclosure* in two. Parallel lanes pulling from
these files would not have found them at all.

The status column is the point. Several of these name nothing yet, and a table that read as
though they were all shipped is precisely how four numbers came to be retracted here before.

| Term | What it means | Status |
| :-- | :-- | :-- |
| **Earned trust** (weighted + earned) | *Earned* = what the agent did, scored per event. *Weighted* = how much that evidence counts, given who observed it and what they had at stake. | **PARTIAL** — earned is live; weighting unimplemented |
| **Issuer-staked reputation** | Whoever issues an attestation stakes on it, so vouching carries downside and cheap vouching cannot inflate a score. | **TARGET** — no issuer-stake in repid-engine (measured) |
| **Decay-unless-re-earned ratchet** | Reputation decays with inactivity and must be *re-earned*, not restored: a lapse costs work to undo, so a high score always describes recent behaviour. | **PARTIAL** — activity decay is live; the ratchet is not built |
| **Selective disclosure** (threshold proof, **not** confession) | The holder proves a predicate — "RepID ≥ X" — revealing neither the score, the events, nor their identity. Nothing is disclosed in order to be believed. | **TARGET** — the ZKP path attests a delta/score range, not a holder-chosen threshold |
| **Dual-auth** | An action needs two independent authorities, so neither a compromised agent nor a compromised host acts alone. | **PARTIAL** — `ControlProof` verifies; gates nothing yet |

**Weighted is not the same as earned, and conflating them is the trap.** Weighting changes how
much an observation counts; earning changes what the agent is owed. A knob that silently moves
the first while looking like the second is the exact shape of the defect measured on 2026-08-17
— reward that responded to *presentation* rather than to *truth*. Related and measured the same
day: a **user-settable risk tolerance is worth +73 RepID on byte-identical work, and penalises
the cautious user by −83**, so preference may govern a user's own experience but must never
govern the thresholds that mint portable RepID. `reports/2026-08-17/REPID-INCENTIVE-AUDIT.md`
in repid-engine.

**And the constraint that falls out of it for zkRepID:** anything that changes *how* a score is
earned — the formula, the gate thresholds, the weighting — must be **inside the proof's
commitment**, and versioned. Otherwise "RepID ≥ 8000" is unfalsifiable, because a verifier
cannot know which regime produced it.

## Where the priorities actually live

**One place: `trinity_tasks`, filtered by `v_agent_preflight`.** Everything
below is deprecated as a planning surface. They still hold data; they are not
where you look to decide what to do next.

| Surface | Status |
| :-- | :-- |
| `trinity_tasks` (+ `v_agent_preflight`) | **canonical** |
| `docs/SPRINT-TRUST-HARNESS.md` | **canonical sprint brief for all agents** — precedence: `SPRINT-DECISIONS-*.md` on main > it > chat |
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
| RepID rewards good behaviour | everywhere, implicitly | **TRUE as of 2026-08-17, and measured** — it was FALSE when first measured the same day (the best-grounded claim was penalised; a truthful strategy tuned to HAL's flag boundary won at every detector accuracy). Fixed by making the clean branch consume quality: honesty now wins at all ten swept combinations, honest-expert goes −143 → **+574**, and a regression guard composes the real functions on every test run. Two open items: throughput now dominates the top of the table, and pre-fix deltas fail ZK re-verification — now measured at **10,627 rows failing a recompute, 0 on-chain attestations, and ZK exposure NOT CHECKABLE** (`zk_proof_id` resolves to no proof row). The realised harm was also measured: **407 clean answers cost 12 agents 1 RepID each**, 406 of them at risk exactly 0. `reports/2026-08-17/LEDGER-VERDICT-REACHABILITY.md`, `reports/2026-08-17/REPID-INCENTIVE-AUDIT.md` |
| x402 settlement | HyperDAG README, handoff | **REAL BUT THIN** — genuine on-chain settlements, low volume |
| ERC-8004 reputation writes | README, badges | **REAL BUT THIN** — genuine writes, low volume |
| Peer verification mesh | handoff | **STOPPED 2026-07-17 22:18Z** — *not* the fleet freeze. Corrected 2026-08-17: all 12 heartbeats stopped four days **before** the pause was set, so the pause cannot be the cause. Throughput had already fallen ~3× on 07-16 ~05:00Z. Cause of neither event is established; no error rows and no deployment events were logged for either |
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
