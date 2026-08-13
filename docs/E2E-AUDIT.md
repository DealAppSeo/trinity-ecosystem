# E2E audit — every surface, the vision, and the gaps

**Date:** 2026-08-12 · **Commit:** `53ac800` · **Method:** every number here was measured, not inferred. Where something could not be checked, it says so.

---

## 1. The headline

Three claims this system makes about itself are **not earned by the code that makes them**:

| Claim | Reality | Evidence |
| :-- | :-- | :-- |
| "Every transaction is authorized by BFT multi-agent consensus" | The authorizer in the payment path is a **16-line stub that returns `passed: true` unconditionally** | `lib/trustshell/BFTAuthorizer.ts` |
| "Solana Devnet Execution" with compliance memos | On any error the executor **fabricates `mock_tx_hash_…` and a real-looking Explorer URL**. `confirmTransaction` is commented out, so even the success path never confirms | `SolanaExecutor.ts:88`, `:94-101` |
| 12 receipts marked `on_chain_verified = true`, status `confirmed` | **2 of those point at fabricated hashes.** Nothing in the codebase writes those columns — the DB defaults are `false`/`'pending'`, so they were set by hand | `kya_compliance_receipts` |

This is the same defect `LESSONS.md` documents four times: **a system reporting success it has not earned.** It is now in the production compliance data, which is the one place it must never be.

A real BFT engine **does exist** — `lib/trust/BFTEngine.ts`, 312 lines, three providers, golden-ratio weights, genuine Pythagorean Comma veto. It is wired to exactly one route, `/api/trust/bft`, which **no UI calls**. The moat is built and unplugged.

---

## 2. Surface inventory

### 2.1 Pages — 2 total

| Route | File | Lines | State |
| :-- | :-- | --: | :-- |
| `/` | `app/page.tsx` | **11** | **Next.js boilerplate.** One `<p>` with a tagline. No nav, no CTA, no link to `/dashboard` |
| `/dashboard` | `app/dashboard/page.tsx` | 86 | Real. Composes all 5 components |

No `loading.tsx`, no `error.tsx`, no `not-found.tsx` anywhere. A thrown error in any component takes the whole page to the Next.js default error screen.

### 2.2 Components — 5, all rendered on `/dashboard`

| Component | Lines | Data source | State |
| :-- | --: | :-- | :-- |
| `SystemTrustScore` | 134 | `/api/trustrails/system-trust` + Supabase | Wired. The "SSL padlock" |
| `AgentRepIDGrid` | 102 | Supabase direct (browser) | Wired |
| `LiveReceiptFeed` | 79 | `/api/trustrails/receipts` + Supabase | Wired |
| `RiskSlider` | 106 | `/api/trustrails/repid/configure` | Wired |
| `InstitutionalControls` | 336 | `/api/trustrails/settings` | Wired. Largest component |

### 2.3 API routes — 10

| Route | Methods | DB | Notes |
| :-- | :-- | :-- | :-- |
| `trustrails/pay` | POST | via lib | **BFT gate is a stub.** Uses `AGENT_SOPHIA_PRIVKEY` (the devnet key leaked in git history) |
| `trustrails/demo` | POST | via lib | 3-beat demo |
| `trustrails/demo/villain` | POST | via lib | Blocks on **KYA/RepID — real**. BFT here is decorative |
| `trustrails/vault` | POST | via lib | 15 lines. Delegates to `VaultPermission` (BFT stub again) |
| `trustrails/receipts` | GET | ✓ | 18 lines |
| `trustrails/system-trust` | GET | ✓ | 82 lines |
| `trustrails/settings` | GET/POST | ✓ | 41 lines |
| `trustrails/repid/configure` | GET/POST | — | 38 lines |
| `trustrails/internal/update-agent` | POST | ✓ | 33 lines. **No auth check** on an `internal/` route |
| `trust/bft` | POST/GET | — | **The real engine. No UI calls it.** |

### 2.4 Data layer — 15 tables, all exist

| Table | Rows | Surfaced in UI? |
| :-- | --: | :-- |
| `trinity_agent_logs` | **137,393** | ✗ |
| `trusttrader_signals` | **30,862** | ✗ |
| `trade_execution_log` | **2,866** | ✗ |
| `cross_llm_comparisons` | 270 | ✗ |
| `agent_repid` | 87 | ✗ (grid reads `agent_kya_registry` instead) |
| `autonomous_tasks` | 69 | ✗ |
| `agent_repid_history` | 41 | ✗ |
| `vault_access_log` | 27 | ✗ |
| `agent_kya_registry` | 12 | ✓ |
| `kya_compliance_receipts` | 12 | ✓ |
| `repid_merkle_events` | 4 | ✗ |
| `institution_config` | 3 | ✓ |
| `institution_risk_config` | 3 | ✓ |
| `permissioned_vaults` | **1** | ✗ |
| `prediction_consensus` | **0** | ✗ |

**171,000+ rows of real operational history exist. The dashboard surfaces 24 of them.** That is the single largest UX gap: the product looks like a demo with twelve records because the UI only reads the two twelve-row tables.

### 2.5 Security posture

| Table | `anon` policies |
| :-- | :-- |
| `agent_kya_registry` | 1 — `SELECT USING (true)` |
| `kya_compliance_receipts` | 1 — `SELECT USING (true)` |
| `agent_repid` | 1 |
| **`trade_execution_log`** | **2** — newly found, 2,866 rows |

The publishable key ships in the browser bundle, so all four are readable in full by anyone who views source. `trade_execution_log` was not in the previously recorded finding.

Also open: the `service_role` JWT recoverable from git history (see `KEY-ROTATION.md`), unrotated.

### 2.6 Not wired to anything

`lib/trusttrader/` — `eip712.ts`, `merkle.ts`, `trade_pipeline.ts`, and two ERC-8004 registry ABIs. No route or component imports them. The ERC-8004 integration described in `CLAUDE_HANDOFF_TRINITY.md` has contracts deployed and code present but **no execution path**.

---

## 3. The declared vision

From `README.md` (StableHacks submission) and `CLAUDE_HANDOFF_TRINITY.md`:

| # | Goal | Built? |
| :-- | :-- | :-- |
| V1 | KYA registry — agents registered, scored | **Yes.** 12 agents, real |
| V2 | RepID 0–10,000 driving limits and vault access | **Yes.** Real, DB-backed |
| V3 | ZKP identity binding | **Honest stub**, labelled as such |
| V4 | BFT consensus + Pythagorean Comma veto gating payments | **Built but unplugged.** Stub in the money path |
| V5 | Solana devnet execution with compliance memos | **Partial.** Mock fallback disguised as real |
| V6 | Fireblocks pre-auth | **Labelled stub.** Honest |
| V7 | ERC-8004 registries on Base Sepolia | **Contracts deployed, code present, no execution path** |
| V8 | Institutional dashboard | **Yes**, for 2 of 15 tables |
| V9 | x402 micropayments | Shadow-wired in repid-engine, not here |
| V10 | TrustTrader / Kraken pipeline | Library only, unwired |

Open GitHub issues: 6, **all from 2026-02-14** — a stale sprint, not a live roadmap.

---

## 4. Gap register, prioritised

Priority is by *risk of someone believing something false*, then by user-visible value.

### P0 — integrity. Fix before anything else

| ID | Gap | Fix |
| :-- | :-- | :-- |
| **G1** | `BFTAuthorizer` returns `passed: true, weight: 1.0` unconditionally, gating `pay`, `demo/villain`, `VaultPermission` | Stub must report **unavailable**, never consensus. Callers record `NOT CHECKED`, not `true` |
| **G2** | `SolanaExecutor` fabricates `mock_tx_hash_…` + a real Explorer URL on failure | Return an explicit `simulated: true`, no fake explorer link |
| **G3** | `confirmTransaction` commented out, yet receipts say `confirmed` | Either confirm, or stop claiming confirmation |
| **G4** | Receipts write `bft_passed` from a stub that cannot fail | Persist `null` when BFT was not evaluated. Nullable already |
| **G5** | 2 of 12 receipts: mock hash **and** `on_chain_verified = true` | Data correction — **needs a human decision**, not done here |
| **G6** | `trade_execution_log` has 2 `anon` policies, 2,866 rows | Policy decision — **needs a human decision** |
| **G7** | `internal/update-agent` has no auth check | Add a shared-secret guard |
| **G8** | Receipt `insert()` result is never checked | A failed insert silently returns a receipt that was never stored |

### P1 — the product looks like a demo

| ID | Gap | Fix |
| :-- | :-- | :-- |
| G9 | `/` is 11 lines of boilerplate | Real landing page; route to `/dashboard` |
| G10 | 171k rows invisible | Surface trades, signals, agent activity |
| G11 | Real BFT engine has no UI | Panel driving `/api/trust/bft` |
| G12 | No `loading` / `error` / `not-found` boundaries | Add them |

### P2 — coherence

| ID | Gap |
| :-- | :-- |
| G13 | `agent_repid` (87 rows) vs `agent_kya_registry` (12) — two reputation stores, UI reads the smaller |
| G14 | 1 vault row behind a multi-vault UI concept |
| G15 | `prediction_consensus` empty — declared, no data |
| G16 | `lib/trusttrader` + ERC-8004 unwired |
| G17 | 6 stale issues from February |
| **G18** | **Tailwind v4 is installed and wired through `postcss.config.mjs`, but `app/globals.css` never does `@import "tailwindcss"` — so no utilities are generated and every Tailwind class in the app renders as nothing.** The old landing page was styled entirely in classes that did nothing. Adding the import pulls a preflight reset across every surface, so it is a visual decision, not a fix |

---

## 6. Fixed in this change

| ID | What changed |
| :-- | :-- |
| G1 | `BFTAuthorizer` returns `evaluated: false` with `consensusWeight: null` and a one-time warning. Still non-blocking (observe posture), but it no longer reports consensus |
| G2 | `SolanaExecutor` returns `txHash: null`, `explorerUrl: null`, `simulated: true` on failure. No fabricated hash, no fake Explorer link |
| G3 | `confirmTransaction` re-enabled. Result carries `confirmed`; a submitted-but-unconfirmed tx reports `submitted`, not `confirmed` |
| G4 | Receipts persist `bft_passed = NULL` when BFT was not evaluated, and `tx_verification_status` of `simulated` / `submitted` / `confirmed`. `on_chain_verified` is set only on genuine confirmation. The audit hash covers `not_evaluated` distinctly so two materially different receipts cannot hash alike |
| G7 | `internal/update-agent` requires `x-internal-secret` matching `INTERNAL_ROUTE_SECRET`, and **fails closed** (503) when the secret is unset |
| G8 | A failed receipt insert now throws instead of returning a receipt that was never stored |
| G9 | Real landing page, inline-styled, with a per-capability status label (LIVE / DEVNET / NOT WIRED / STUB) |
| G12 | Added `app/error.tsx`, `app/not-found.tsx`, `app/dashboard/error.tsx`, `app/dashboard/loading.tsx` |
| — | `demo/route.ts` no longer hardcodes "BFT consensus passed."; `villain/route.ts` drops an unused `BFTAuthorizer` |

**Verification:** `tsc --noEmit` → 36 errors, **one fewer than the 37 on `main`**, none in any touched file. `next build` → passes, 12 routes.

### Still open, needs a human decision

- **G5** — 2 receipts with mock hashes marked `on_chain_verified = true`. Correcting production compliance data is not an agent's call.
- **G6** — `trade_execution_log` `anon` policies, plus the three previously known tables.
- **G1 follow-up** — whether to wire `lib/trust/BFTEngine.ts` into the payment path. It calls three LLM providers, so it adds seconds of latency and per-payment cost. Architectural, not cleanup.
- **G18** — whether to enable Tailwind properly or remove the dependency.
- The `service_role` JWT in git history remains unrotated.

---

## 5. Fixing order

1. **G1–G4, G7, G8** — code-only, no policy decisions. Makes the system stop lying about itself.
2. **G9, G12** — landing page and boundaries.
3. **G10, G11** — surface the data that already exists. Highest visible payoff.
4. **G5, G6** — await a human decision.
5. P2 — after the above.

The P0 set is the same principle as `TRUSTSHELL-V1.md` §6: **three states, never two.** A check that did not run must report `NOT CHECKED`, never `pass`. Every P0 here is a system rounding silence up to success.
