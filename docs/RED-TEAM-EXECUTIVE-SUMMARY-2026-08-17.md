# Trust Layer Red Team — Executive Summary (all campaigns)

**Engagement:** 2026-08-16 → 2026-08-17. Seven campaigns across three repositories
(`trinity-ecosystem`, `DealAppSeo/trustshell`, `DealAppSeo/repid-engine`) and one
external chain (Base Sepolia / ERC-8004). Constructive posture throughout: every
finding carries severity, evidence, impact, a fix, and a re-test. Delivered as an
executable suite — `npm run check:redteam`, **11 probes**, wired into CI — plus
per-campaign reports and an evidence trail.

---

## Overall posture

**The trust *arithmetic* is sound and well-guarded. The exposure is at the
*seams* — auth wiring, key hygiene, ledger accuracy, and configuration.**

The system's central claim survived adversarial testing: **a RepID score is
HAL-computed server-side, not self-asserted, and its live value is protected by
real controls** (a fact-check quorum gate, a penalty-guard trigger, and an
earned-tier floor). Every probe aimed at the computational core — receipt audit
integrity, spending-limit type confusion, self-asserted reputation — **held under
attack, with transcripts.** Nothing in the trust maths was forgeable.

What is open is almost entirely at the boundaries: a payment gate that checks a
string instead of a signature, an unauthenticated public endpoint, a disabled
key shipped to browsers, a ledger that overstates a penalty it didn't apply, and
deployer keys that are live on the testnet where the identities exist. **None is
a break of the core; all are real and worth fixing; none is currently a Critical
in production.**

**By the numbers:** 7 open findings (**1 High, 4 Medium, 2 Low** — zero open
Critical), 4 controls held under full attack (all in the Critical-/High-if-broken
class), 2 Low informational notes, and 1 open question routed to Sean.

---

## Highest-severity findings (act on these)

1. **PAY-001 (High) — the dual-signature gate verifies no cryptography.** The
   payment path's "two co-signatures" control counts distinct caller-supplied
   `role` strings; `[{role:CFO},{role:CTO}]` satisfies it with no keys. Source-
   derived (the live host is unreachable from the test harness). **Mooted today**
   because both live surfaces fail closed on receipt minting (LIVE-001) — but that
   is a configuration accident, not a control. Fix before minting is enabled; the
   repo already ships the primitive (`countersignContract`).

2. **ERC8004-001 (Medium, could become High) — leaked deployer/attestor keys are
   live on the operative chain.** Two keys in git history (`0xf6eE1768…`,
   `0xdf6b8215…`) are **active and funded on Base Sepolia** — the chain where the
   ERC-8004 identities live — and `0xf6eE1768…` **minted those identities.** This
   corrected the prior-work record, which read "balance 0 / nonce 0" (that was
   *mainnet*). **One open question decides the severity** (below): whether the live
   EIP-712 attestor key is one of these leaked keys. Held mitigant: the
   reputation-*write* authority was correctly rotated off them.

3. **LIVE-002 (Medium) — trustshell.dev ships a disabled Supabase key.** The
   client bundle embeds a legacy `anon` JWT the project disabled 2026-08-04
   (live-confirmed 401). It fails *closed* — nothing leaks — but any Supabase-backed
   feature is silently dead, the exact root cause of the 217-day-dead
   aitrinitysymphony lead form. One redeploy with current keys fixes it.

---

## Immediate actions (ranked)

| # | action | owner | unblocks |
|---|---|---|---|
| 1 | **Answer the attestor-key question** on PR #66 (10-second check) | Sean | finalizes ERC8004-001 severity |
| 2 | **Rotate the leaked EVM keys** before any mainnet move | Sean | ERC8004-001 |
| 3 | **Redeploy trustshell** with `sb_publishable_`/`sb_secret_` keys | Sean | LIVE-002 |
| 4 | **Add auth to the public score-event path** (the fix already exists on the sibling bearer path) | Sean | REPID-ENG-001 |
| 5 | **Wire `countersignContract` into the dual-sig gate** before receipt minting is enabled | Sean | PAY-001 |

---

## Full findings ledger (`scripts/redteam/ledger.json`)

| ID | Sev | Component | One line | Status |
|---|---|---|---|---|
| PAY-001 | High | TrustShell payments | dual-sig gate counts role strings, verifies no signature | open, mooted by fail-closed minting |
| ERC8004-001 | Med | ERC-8004 on-chain | leaked keys live+funded on Base Sepolia; one minted the identities | open; 1 Sean question pending |
| LIVE-002 | Med | trustshell.dev | disabled legacy Supabase key in the browser bundle → dead integration | open |
| REPID-ENG-001 | Med | repid-engine scoring | public score-event path has no auth → decision *attribution* to any agent | open; griefing magnitude measured |
| HAL-001 | Med | HAL audit chain | `verifyHalChain` returns VERIFIED over an unanchorable (truncatable) window | open; no prod caller yet |
| RCPT-001 | Low | receipts | abandoned-secret guard is case-sensitive | open; no live surface holds a variant |
| REPID-ENG-003 | Low | repid-engine ledger | event overstates the applied penalty vs the earned-floor-clamped live score | open; from a good control |

**Open, non-ledgered (informational):** HDR-001 (trustshell.dev has HSTS but no
CSP/XFO/nosniff), HDN-001 (the free-tier gate is safe only because Railway
normalizes `X-Forwarded-For`). **Open question:** is the EIP-712 attestor key the
leaked `0xf6eE1768…` or rotated (PR #66, Sean).

---

## What held under attack (the reassurance is evidence-backed)

| Probe | Sev if broken | What was proven |
|---|---|---|
| RCPT-002 | Critical | Receipt audit preimage commits to all 9 fields; 18 near-collision/type-confusion variants encode distinctly |
| LIVE-001 | Critical | Neither live surface would mint under a published secret (executes the mint guard against live evidence) |
| PAY-002 | Critical | Spending limits reject 20 hostile amount/limit inputs; the `NaN > limit` fail-open is **not** present |
| REPID-001 | High | No self-asserted-only input reaches a funded tier; the reachable ceiling matches the scoring path |

Also established and held during the campaigns: the RepID score is HAL-computed on
both score-event paths; penalties require a fact-check quorum + a penalty-guard
trigger + an earned-tier floor (the griefing test measured a **zero** live-score
drain); the bearer score-event path enforces ownership; the LLM `/complete` proxy
redacts user API keys from logs and its gate is not IP-spoofable on this
deployment; the client-side key vault uses AES-256-GCM with PBKDF2-250k.

---

## Methodology — why the "held" results are credible

A red team that only finds problems can't be trusted when it says something is
safe. Four moments show the discipline was real:

- **The suite caught its own bugs before publication.** Probe anchors (a
  known-good case in every battery) caught a wrong field name that made 18 receipt
  variants falsely "collide" — **one commit from publishing four fabricated
  Critical findings** — and a fixture that mis-dated a HAL-chain genesis entry.
- **Execution refuted scary source patterns.** `LIVE-001` was first written with
  the fail-open/fail-closed severity *backwards*; running the guard corrected it.
  The `/complete` gate's `x-forwarded-for[0]` **looks** spoofable; three live
  requests with spoofed IPs proved the deployment normalizes it.
- **A prior-work figure was corrected, not repeated.** The leaked-key item read
  "nonce 0" — true on mainnet, false on the operative testnet chain, which the
  record itself had marked "NOT CHECKED." We checked it.
- **Every claim states its boundary.** Source-derived vs live-observed is labeled;
  the one write test (griefing) was run on a self-created throwaway and cleaned up
  to zero rows; on-chain work was read-only; no keys were extracted; Sean-gated
  actions (key rotation, live-gate changes) were logged as BLOCKED_FOR_SEAN, never
  performed.

---

## Coverage map

| surface | status |
|---|---|
| TrustShell trust layer (receipts, limits, HAL chain, RepID, staged judge) | **TESTED** — executable probes, mostly held |
| trustshell.dev (live surface + full source) | **TESTED** — LIVE-002, HDR-001; client code otherwise clean |
| repid-engine scoring (public + bearer score-event, HAL path) | **TESTED** — REPID-ENG-001/003; core held |
| repid-engine `/complete` LLM proxy (keys, gate, injection) | **TESTED** — held; HDN-001 note |
| ERC-8004 on-chain identity + reputation (Base Sepolia) | **TESTED** read-only — ERC8004-001 |
| EIP-712 attestation signer | **PARTIAL** — narrowed to one Sean question |
| Payment path live behaviour (dual-sig, x402 settlement) | **SOURCE-DERIVED** — live host proxy-denied from the harness |
| ERC-8004 registry contracts' own access control | **NOT ATTEMPTED** — external contracts, need verified source |
| Multi-turn / prompt-injection against HAL (Garak, PyRIT) | **NOT ATTEMPTED** — needs a live endpoint + egress; a collector job |

---

## Residual risk & next campaign

**Residual risk: contained, and concentrated in items with named owners and
exact fixes.** The core is defensible; the open set is auth wiring, key hygiene,
one ledger-accuracy bug, and configuration. The two things that would most change
the picture are both quick: **Sean answering the attestor question** (it either
escalates ERC8004-001 to High or closes it at Medium), and **rotating the leaked
keys** before any mainnet move.

**Next campaigns, in priority order:** (1) resolve the attestor question and, if
needed, escalate; (2) once trustshell/repid-engine auth items land, re-run the
open probes to close them; (3) a live/multi-turn campaign against HAL using Garak
or PyRIT, run by a collector with egress (the charter, `docs/RED-TEAM-CHARTER.md`,
describes the hand-off); (4) the ERC-8004 registry contracts' access control from
their verified source.

*Reproduce any figure here with `npm run check:redteam -- --json`. Per-campaign
detail: `docs/RED-TEAM-BASELINE-2026-08-16.md`, `…-TRUSTSHELL-DEV-…`,
`…-TRUSTSHELL-SOURCE-…`, `…-STRIX-TRUSTSHELL-…`, `…-REPID-ENGINE-…`,
`…-ERC8004-…`; charter and collection model in `docs/RED-TEAM-CHARTER.md`.*
