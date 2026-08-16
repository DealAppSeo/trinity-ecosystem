# TrustShell v1 — specification

**Status:** spec, with M1–M6 built or run. §10 is the ledger. **M6's verdict is
the one to read first: on the only real session available the harness caught
zero of the six defects that session actually contained** — see
`docs/TRUSTSHELL-M6-DOGFOOD.md`. Its "10 real sessions" criterion is **unmet**;
one exists here.

§3 and §4.2 carry corrections the M1 build forced on the spec that specified
them; §4.1 and §12 carry M2's; §8 and §10 carry M3's; §4.3.1 carries M4's
measurement; §9 and §12 Q3 carry M5's. §12 Q1, Q2 and Q3 are **decided**, not
open.
**Date:** 2026-08-12, revised 2026-08-15

Every milestone built so far has falsified something this document asserted.
That is the document working, not failing — but it means the unbuilt half should
be read as a plan, not a description.

TrustShell turns an AI agent's assertions into receipts you can verify without
trusting the agent or the vendor.

## 0. Decisions

| Question | Decision |
| :-- | :-- |
| Surface | Developer, via **CLI** — MCP dropped 2026-08-15, see §12 Q3 |
| Posture | **Observe.** Shadow mode; never blocks an agent |
| What is verified | Agent **actions**, **spend**, and **hallucination** |

## 1. Why this and not "a better agent"

The failure that needs a harness is not the agent that errors — you read the
error. It is the agent that **reports success it has not earned.** This repo has
a log of them. From one session:

| Where | The false pass |
| :-- | :-- |
| repid-engine E2E | 6/6 green against a service that never issued a token or ran a round |
| `next build` | green over two undefined `supabase` references |
| `release-trust-demo` | green with no credential at all |
| `scan-secrets.mjs --history` | *"No credential-shaped strings found"* — from a `git grep` that exited 128 and never ran |

The last one happened while building the tool whose job is to detect this class
of failure, roughly four hours before this document was written. None of the
four were caught by the system reporting them. All four were caught by comparing
the report against something independently measurable.

That comparison is the product.

## 2. Non-goals for v1

Naming these prevents scope drift and prevents the marker from over-claiming.

- **Not a fact-checker.** "Is this true about the world" is undecidable here.
  "Is this assertion backed by evidence in this session" is decidable. Only the
  second is in scope.
- **Not a blocker.** No refusals, no gating, no interception. See §7.
- **Not a consumer product.** A browser extension for chat UIs is a different
  build; MCP cannot reach `chatgpt.com`.
- **Not multi-vendor at v1.** Claude Code first, because its transcript format
  is on disk and stable. Cursor and Claude Desktop follow once the receipt
  schema has settled.

## 3. Architecture: MCP is the interface, not the observer

**The trap.** An MCP server is *called by* an agent. It cannot passively watch
one. A design where the agent voluntarily calls `trustshell.claim(...)` verifies
only the claims a cooperative agent chooses to declare — which is exactly the
population that needs verifying least. Any spec that skips this point is
describing something that cannot be built.

**The actual observation substrate** is the session transcript, which Claude
Code already writes to disk:

```
~/.claude/projects/<cwd-slug>/<session-id>.jsonl
```

Measured on the session that produced this document — 4,705 records, 13 MB:

| Record / field | Count | Use |
| :-- | --: | :-- |
| `tool_use` blocks | 1,089 | what the agent actually did |
| `tool_result` blocks | 1,087 | what actually came back |
| assistant `text` blocks | 496 | the claims |
| `thinking` blocks | 585 | excluded — not an assertion to the user |
| orphan `tool_use` (no result) | 2 | matched the two user interruptions |
| `tool_result` with no `tool_use` | **0** | referential integrity holds |

**Corrected 2026-08-13, by the M1 parser this table specified.** The hand count
above was taken mid-session and two of its properties do not survive contact
with the parser:

- **`tool_result` blocks outnumber `tool_use` blocks**, not the reverse. The
  table implies `results = uses − orphans`; in fact a rejected-then-approved or
  retried call has its result delivered **twice** under one `tool_use_id`. On
  the same session re-measured: 1,562 uses, 2 orphans, 11 duplicate deliveries,
  1,571 result blocks — `1562 − 2 + 11 = 1571`. One call, two deliveries, still
  one action. A parser that assumes the shorthand double-counts the action.
- **The transcript is a forest, not a log.** 85 branch points, 10 chain roots —
  7 of them records whose `parentUuid` is not in the file at all, left by
  context compaction and session resume. Nothing in the format records which
  sibling won at a branch, so **which records are live is not decidable** from
  the transcript. The parser measures the graph and declines to guess; see the
  note on `TranscriptGraph`.

`0 phantom results` (a `tool_result` whose `tool_use` is absent) does hold, and
is asserted, not assumed.

Also present per record: `toolUseID`, `parentUuid`, `uuid`, `timestamp`,
`sessionId`, `gitBranch`, `cwd`, `permissionMode`, `attributionMcpServer`,
`attributionMcpTool`, `hookCount`, `hookErrors`, and per-turn
`message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`) with `message.model`.

That is enough to reconstruct every action, its cost, and whether a claim has
evidence behind it — with no cooperation from the agent.

```
                    ┌──────────────────────────────┐
  agent session ───▶│ <session-id>.jsonl (on disk) │
                    └──────────────┬───────────────┘
                                   │  tail / on Stop hook
                                   ▼
                    ┌──────────────────────────────┐
                    │  trustshell observer         │  ← pure read, no interception
                    │  actions │ spend │ claims    │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  session receipt (signed)    │
                    └──────┬────────────────┬──────┘
                           ▼                ▼
                    CLI / Stop hook    verify-receipt
                    (query surface)    (anyone, offline, no deps)
```

**Ingest modes.** Batch (`Stop` hook, or `trustshell verify <session>`) for v1.
Streaming (`tail -f` on the JSONL) is a v1.1 concern; nothing in the receipt
schema depends on which is used.

## 4. The three pillars

### 4.1 Actions — did it do what it says?

Cheap and fully decidable from the transcript. For each session emit:

- every `tool_use` with its name, MCP attribution, timestamp, and whether a
  `tool_result` returned
- writes separated from reads: `Edit`/`Write`/`Bash` with side effects, versus
  `Read`/`Grep`/`Glob`
- files touched, reconciled against what changed on disk during the session
- orphan invocations (denied, interrupted, in-flight) — reported, never hidden

The reconciliation is what makes this more than a log: it catches an agent that
says it edited a file when nothing changed on disk.

**Corrected 2026-08-15, by the M2 build.** This bullet said *"reconciled against
`git diff` for the same `gitBranch`"*, and the CLI implemented exactly that.
`git diff --name-only HEAD` lists **unstaged edits to tracked files**, which is
not the question. Run against a real session it reported **13 mismatches out of
15 files**, every one of them a file the agent genuinely wrote and then either
committed (gone from `diff HEAD`) or created new (untracked, so also absent).

A reconciler that cries wolf is worse than none: it trains people to ignore the
marker, which is §11's named risk for T1 arriving early via a different route.
The question that matches the intent is *what changed during this session* —
the union of the working tree including untracked files
(`git status --porcelain -uall -z`) and anything committed since the session
started (`git log --since`). If the session start is unknown the commit half
cannot be bounded, so the receipt reports **NOT CHECKED** rather than
reconciling against a window it invented. After the fix: **0 mismatches** on the
same session.

Second-order, and the reason `receipt/git.ts` is a module with its own
assertions rather than four lines in a script: the caller `.trim()`-ed git's
porcelain output. An unstaged modification leads with a **space** (`" M path"`),
so trimming shifted the first record by one and returned one path missing its
first character — a single false mismatch that looked exactly like a real
finding. Whitespace-significant formats need a parser that is tested, not a
slice at the call site.

### 4.2 Spend — what did it cost, and was it authorised?

`message.usage` is recorded per turn.

**Corrected 2026-08-13.** An earlier draft of this section reported *2,111,919
output tokens across 2,175 assistant turns* for this session. That figure was a
**per-record sum, and it overcounts by roughly 2.36×.**

Claude Code writes one record per content block of an assistant turn and repeats
that turn's `usage` object **verbatim on every one of them** — a turn that
thinks, speaks, and calls a tool contributes three records carrying identical
token counts. [VERIFIED — 1,507 distinct `requestId` groups across 3,147
assistant records; every group's usage identical across its records, zero
groups differing.] Records are not turns, and `requestId` is what separates
them.

Same session, re-measured by the parser: **1,389,855 output tokens across 1,507
turns**, where the per-record sum would say 3,277,108 across 3,147 records.

The parser reports the deduplicated figure and keeps the naive one beside it in
`spend.naive`, with the ratio. Two numbers that differ by 2.36× must never be
reachable by the same field name — a receipt that says "output tokens" without
saying which is a receipt nobody can re-derive.

v1 reports cost per session, per model, and per tool. It does **not** enforce a
budget.

The authorisation half already exists elsewhere: the **x402 authority gate**
(shadow-wired in repid-engine #424) and the `spending_limit_daily` /
`spending_limit_per_tx` columns on `agent_kya_registry`. v1 records observed
spend against those declared limits and flags divergence. That divergence data
is precisely what would justify turning enforcement on later — which is the
argument for shadow mode in one sentence.

### 4.3 Hallucination — is the claim backed by evidence?

The hard pillar, and the one that needs tiering rather than a single mechanism.

A measurement that shaped this section: in the session above, `send_later` was
**invoked 16 times** and **named in prose 12 times**. The A6 failure recorded in
`LESSONS.md` — a claimed `send_later` failure and cron fallback that never
happened — would **not** be caught by checking whether the tool was used. It was
a fabricated *outcome* of a tool that genuinely ran. Name-presence detection
would have passed it.

So, three tiers, in increasing cost and decreasing certainty:

| Tier | Detects | Method | Cost | Verdict strength |
| :-- | :-- | :-- | :-- | :-- |
| **T0** | Claims naming a tool, file, command, PR or URL with **no corresponding `tool_use` anywhere** in the session | String/AST extraction, set difference | ~free | Decidable |
| **T1** | Claims of a **state** (test passed, file exists, deploy green, row count) whose linked `tool_result` is **absent or contradicts** | Claim→evidence linking by proximity + `toolUseID` | cheap | Decidable, with a false-positive rate to be measured |
| **T2** | Claims whose supporting `tool_result` **exists but does not actually support the assertion** — the A6 class | Second model compares claim against cited evidence | one inference per claim | Probabilistic — needs a panel |

**T2 is where the existing consensus machinery earns its place.**
`lib/trust/cross-llm-verifier.ts` is already lazy and guarded, and the BFT/SBFA
engine with the Pythagorean Comma veto already exists. A T2 verdict should be a
panel of independent judges given *distinct lenses* (does the evidence exist; does
it say what is claimed; would it reproduce), not N identical refuters — diversity
catches failure modes redundancy cannot.

### 4.3.1 Measured false-positive rate — M4, 2026-08-15

§11 names T1 false positives as the way this feature dies, and requires
measurement before shipping. Here is the measurement, including the part that
does not flatter it.

**Sample: one session.** `n=1`, 618 lines, 48 assistant text spans, 158 tool
calls, one agent, one model, one repo. That is every real transcript present in
the container. It is far too small to generalise from, and the numbers below
should be read as "this did not cry wolf once" rather than as a rate. Widening
the sample is the single cheapest thing that would improve this tier, and it is
M6's job.

| pass | contradictions raised | true | false | precision |
| :-- | --: | --: | --: | :-- |
| first draft | 2 | 0 | **2** | **0%** |
| after tightening | **0** | 0 | 0 | undefined (no positives) |

Both original findings were hand-labelled and both were wrong:

1. *"CI is healthy — `b53ae9c` went fully green"* was linked to a failed `Bash`
   call it had nothing to do with. The claim's evidence came from a different
   tool entirely.
2. *"[VERIFIED this session]"* was scored as a success assertion. `VERIFIED` is
   this repo's **epistemic tag**, not a claim about the adjacent call.

Three rule changes followed, each now a regression fixture in
`scripts/check-claims.mjs`:

- `clean`, `green` and `verified` were removed from the success vocabulary.
  Words carrying a house meaning cannot be scored as assertions about adjacent
  evidence.
- Linking narrowed from *any failed call in the window* to **the immediately
  preceding call**. A span typically follows several calls, and asserting
  success about one while an unrelated other failed is ordinary correct
  reporting — that was the structural cause of both false positives.
- **T1 no longer emits `backed` at all.** It can refute; it cannot confirm. The
  five `backed` verdicts the first draft produced were all long summary messages
  sitting after an unrelated call that happened to succeed. Proximity to a green
  tool does not establish that a sentence is supported by it, and scoring it so
  would let a receipt reach VERIFIED on adjacency alone.

**T0's rate is not measured, because T0 had nothing to find.** Across those 48
spans there were **zero** `mcp__*__*` identifiers and **zero** backticked
built-in tool names. [VERIFIED — independent grep of the assistant text blocks.]
T0 fires correctly on synthetic input, so it is not dead; but its trigger shape —
a tool identifier named in user-facing prose — appears to be **rare in real
output**, which caps how much it can ever contribute. Its precision is `0/0`,
undefined, and reporting it as 0% would be the two-outcome collapse again.

**What the tiers catch, after all of that:** an agent asserting mechanical
success (`exit 0`, `passed`, `no X found`) over an immediately preceding call
that errored or was denied, and an agent claiming to have run a tool with no
invocation anywhere in the session. **What they do not catch:** a fabricated
outcome of a call that genuinely ran and genuinely succeeded — LESSONS A6 — which
is T2 by construction and is counted as unchecked.

**v1 ships T0 and T1 only.** T2 is specified here so the receipt schema has room
for it, and gated behind a flag until its false-positive rate is measured on
real sessions. Shipping a hallucination detector that cries wolf would destroy
the marker's credibility faster than shipping nothing.

**Calibration set.** `LESSONS.md` already contains dated, reproducible agent
failures with ground truth. That is the initial eval set — including the four in
§1. A detector that cannot catch A6 is not finished.

## 5. The session receipt

A new table. **`kya_compliance_receipts` is not it** — that table is
payment-specific (`payment_amount_usdc`, `recipient_address`, `solana_tx_hash`,
`fireblocks_preauth_id`) and should not be overloaded. What v1 copies is its
*discipline*: a content hash, a rule hash, an explicit pass/fail per check, and a
proof CID.

```
trustshell_session_receipts
  receipt_id            text primary key   -- ts_<base32(audit_hash)[:16]>
  session_id            text
  cwd, git_branch,
  git_head_sha          text               -- what the claims were about
  started_at, ended_at  timestamptz
  model                 text
  ruleset_version       text               -- which checks ran
  rule_hash             text               -- hash of the ruleset, as KYA does

  -- actions
  tool_calls            int
  tool_results          int
  orphan_calls          int
  write_ops             int
  files_touched         text[]
  git_diff_reconciled   boolean

  -- spend
  input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens  bigint
  declared_limit_daily  numeric           -- from agent_kya_registry, if bound
  limit_divergence      boolean

  -- claims
  claims_total          int
  claims_verified       int
  claims_unchecked      int               -- MUST be reported, see §6
  claims_failed         int
  findings              jsonb             -- [{tier, claim_span, evidence_ref, verdict}]

  -- integrity
  transcript_sha256     text              -- the input, pinned
  audit_hash            text              -- hash of this receipt's canonical form
  signature             text              -- ed25519 over audit_hash
  zkp_proof_cid         text              -- nullable, T2/attestation path
```

`transcript_sha256` is what makes the receipt checkable: a verifier re-reads the
same transcript, recomputes, and compares. `audit_hash` covers every field above
it in canonical JSON form.

## 6. The marker — three states, never two

Every harnessed session renders one line, in the CLI and in any surface that
consumes the receipt:

```
✓ VERIFIED    47 claims · 47 backed · 1,089 actions · 2.1M out    ts_9f3a2c8e1b7d4a06
⚠ NOT CHECKED 47 claims · 31 backed · 16 unchecked                ts_…
✗ FAILED       47 claims · 44 backed ·  3 contradicted            ts_…
```

**`NOT CHECKED` is the state that makes the other two mean anything.** A marker
that only ever shows green is a trust badge, and trust badges are worthless. The
SSL padlock's power was never the icon — it was that anyone could independently
verify the certificate. `SystemTrustScore.tsx` already calls the padlock "the
most important visual"; this is the same instinct, one layer deeper.

Concretely: if T2 is disabled, every T2-class claim counts as **unchecked**, not
verified. The receipt must never round silence up to success. That is the exact
bug in §1.

## 7. Shadow mode semantics

Precise, so "observe" cannot drift:

1. TrustShell **never** intercepts a tool call, mutates a request, or returns an
   error that changes agent behaviour.
2. It runs **after** the fact — on `Stop`, or on demand against a saved
   transcript. Read-only on the transcript; it never writes to `~/.claude`.
3. A TrustShell crash must not fail the session. Wrap the hook so a non-zero
   exit is logged and swallowed.
4. Enforcement is a **separate, later, opt-in** product decision, justified by
   divergence data this mode collects. It is not a config flag hidden in v1.

## 8. Independent verification

The receipt is worthless if only TrustShell can check it.

**Corrected 2026-08-15, by the M3 build.** This section claimed
`@hyperdag/proof-verifier@0.2.0` *"verifies a receipt offline from
`transcript_sha256` + `audit_hash` + `signature`"*. **It does not, and it
cannot.** Measured against the published package: it is a **Plonky3 STARK
verifier** whose public statement is `{agent_id, repid_score, threshold, tier}`.
It deserializes STARK proof bytes and checks a 16-bit range argument, pinned to
one Plonky3 revision. Handed anything else it returns
`verify failed: deser: io error`. [VERIFIED — installed from npm and invoked.]

It has no concept of a session receipt. Teaching it one means a Rust/WASM
rebuild — blocked in agent containers by task #75 — plus an irreversible npm
publish, which is Sean's call. The spec named a mechanism without checking it,
the same class of error as §4.1's git bullet.

What actually closes §8:

- **`scripts/trustshell-verify-receipt.mjs`** — verifies a receipt offline from
  `transcript_sha256` + `audit_hash` + `signature`, with no network, no
  dependencies and **no TrustShell imports**. Independence is the whole point: a
  verifier that calls the builder's `canonicalJson` agrees by construction and
  proves nothing, so canonical JSON, base58, base32, the did:key decode and the
  marker rule are all re-implemented from the spec. Two implementations agreeing
  is evidence; one agreeing with itself is a tautology.

  **What a pass means.** The bytes are internally consistent, the receipt
  commits to the exact transcript supplied, the signature is good, and the
  marker matches the data rather than being asserted.

  **What it does not mean.** The *counts* are not re-derived — that needs a
  second `TranscriptParser`, which does not exist. What pins them instead is the
  pair (`transcript_sha256`, `parser_version`): anyone with the same bytes and
  the same parser re-runs and compares. That is weaker than re-derivation and
  the tool prints it as `NOT CHECKED` rather than omitting it. Nor is the
  *author* independent — same repo, same hand. That is M6.

  **One known limit, asserted rather than hidden:** `attestation.kind` is
  outside the signed payload, so a `self` receipt can be relabelled `org` and
  the signature still verifies. Only the audit hash is signed. Binding custody
  into the signature is a schema change.
- **`@hyperdag/trust-demo@0.1.0`** (packed, verified locally, unpublished) —
  already verifies a proof and rejects three tampers. This is the padlock's
  substance: a stranger can check the claim without trusting the issuer.

Publishing `trust-demo` requires an irreversible git tag and is a human
decision. It is not on the v1 critical path, but it is the best demo asset here.

## 9. Package layout

[PROBED 2026-08-15: `@hyperdag/trustshell@1.3.0` — installed from npm. HAL cross-LLM verification, portable RepID, A2A service purchase, against a LIVE BACKEND. CLI: `verify | repid | proof | badge | version`. **Zero** occurrences of `transcript`, `audit_hash` or `session_receipt` in `dist/`. Its `verify` already means "verify an LLM output".]

[PROBED 2026-08-15: `@hyperdag/trustshell-mcp@1.0.0` — installed from npm. Registers `verify_output`, `get_repid`, `present_proof`, `verify_proof`, `buy_service`, `list_services`. Same product as `@hyperdag/trustshell`; zero transcript/receipt content in `dist/`.]

[PROBED 2026-08-15: `@hyperdag/proof-verifier@0.2.0` — installed and invoked. A Plonky3 STARK verifier; public statement `{agent_id, repid_score, threshold, tier}`. Handed anything else it returns `verify failed: deser: io error`. It cannot verify a session receipt.]

[PROBED 2026-08-15: `@hyperdag/trust-demo@0.1.0` — `npm view` returns **E404, not in the registry**. This CONFIRMS the "packed, unpublished" status rather than refuting it; the version is unburned and still publishable.]


| Package | State | v1 role |
| :-- | :-- | :-- |
| `@hyperdag/trustshell` | published 1.3.0 | **NOT this product** — see below |
| `@hyperdag/trustshell-mcp` | published 1.0.0 | **NOT this product** — see below |
| `@hyperdag/proof-verifier` | published 0.2.0 | **RepID STARK proofs, not receipts** — see §8 |
| `trustshell verify-receipt` | **new, built** | offline receipt verification, zero deps |
| `@hyperdag/trust-demo` | packed, unpublished | tamper-rejection demo |
| `trustshell init` | **new** | detect installed MCP clients, write config + `Stop` hook |

**Corrected 2026-08-15, by the M5 build.** The two rows above claimed the
published packages were this product's core and its MCP vehicle. They are not.
Measured by installing both from npm:

| package | what it actually is |
| :-- | :-- |
| `@hyperdag/trustshell@1.3.0` | HAL cross-LLM verification, portable RepID, A2A service purchase, **against a live backend**. CLI: `verify \| repid \| proof \| badge \| version`. **Zero** occurrences of `transcript`, `audit_hash` or `session_receipt` in `dist/`. |
| `@hyperdag/trustshell-mcp@1.0.0` | MCP tools `verify_output`, `get_repid`, `present_proof`, `verify_proof`, `buy_service`, `list_services`. Same product. Also zero. |

They share a name with this harness and nothing else. Two consequences:

1. **`trustshell verify <session>` would collide.** `trustshell verify` already
   ships and means *verify an LLM output*. A second meaning for the same verb on
   the same binary is a permanent support burden. The receipt tooling needs its
   own name before it is ever published.
2. **Adding receipts to that package means publishing a new version of a live
   SDK.** Publishing is irreversible and Sean-gated, so M5 installs the local
   tooling by absolute path instead and assumes no publish.

**MCP tools exposed: none. §12 Q3 is decided — CLI and file output only.**
Two reasons, and the second is new:

- The one the spec already gave: MCP output is visible to the agent, which can
  then talk about its own score. Keeping the marker out of the model's context
  is the cleanest v1.
- The MCP namespace is **occupied by a different product**. A
  `trustshell_verify_session` tool sitting beside that package's `verify_output`
  invites exactly the confusion — "which verify is the trustworthy one?" — that
  the marker exists to remove.

**CLI, as built:** `trustshell-init` (install/uninstall the Stop hook),
`trustshell-receipt` (emit a receipt), `trustshell-verify-receipt` (check one,
independently). All local scripts today.

`trustshell init` is the onboarding described in the original sketch — scan the
environment, find which MCP clients are installed, write the config. It is
mechanical, not clever, and it is the whole first-run experience. It is **dry run
by default**, backs the file up before writing, is idempotent, preserves hooks it
did not install, refuses to overwrite settings it cannot parse, and is reversible
with `--uninstall`.

## 10. Milestones

| # | Deliverable | Done when |
| :-- | :-- | :-- |
| M1 | Transcript parser | **DONE 2026-08-13.** `lib/trustshell/TranscriptParser.ts`, 42 assertions in `scripts/check-transcript-parser.mjs`, CLI `scripts/trustshell-parse.mjs`. Reproduces §3 on the live session; **0 phantom results**; 0 malformed lines; 0 unrecognised record types; 0 new `tsc` errors. Corrections it forced are folded into §3 and §4.2 above. |
| M2 | Actions + spend receipt | **DONE 2026-08-15.** `lib/trustshell/receipt/` (types, canonical, build, sign, git, store-sqlite), 89 assertions in `scripts/check-receipt.mjs`, CLI `scripts/trustshell-receipt.mjs`. `audit_hash` stable across re-runs [VERIFIED on a live 294-line session: identical hash twice, `ts_…` id derived from it]. Storage and custody decided — see §12. Nine tamper mutations detected; four mutations of the checker itself caught, each compiled. **The receipt reads `NOT CHECKED`, and §12.5 explains why that is the correct output rather than a shortfall.** |
| M3 | Independent offline verification | **DONE 2026-08-15, against a corrected target.** `scripts/trustshell-verify-receipt.mjs` — zero TrustShell imports, zero dependencies; canonical JSON, base58, base32, did:key decode, Ed25519 verify and the marker rule all re-implemented. 60 assertions in `scripts/check-receipt-verifier.mjs`, run as a **subprocess** so it cannot share module state. Twelve tamper mutations detected; a differential over twelve awkward canonicalisation shapes and six marker branches agrees with the builder on every one. Four mutations of the verifier caught, each compiled. **`@hyperdag/proof-verifier` cannot do this — see below.** |
| M4 | T0 + T1 claim checking | **DONE 2026-08-15.** `lib/trustshell/receipt/claims.ts`, 35 assertions in `scripts/check-claims.mjs`, `--claims` on the CLI. Catches the 2026-08-12 `scan-secrets` entry (reconstructed from LESSONS, not recovered): `git grep` exited 128, the agent reported *"No credential-shaped strings found"*, T1 contradicts it. FPR measured and published in §4.3.1 — **2 findings, 2 false positives, 0% precision on the first draft**; 0 raised after tightening, on a sample of **one session**. Parser bumped to 1.1.0 to expose claim spans. Five mutations caught — one survived first and exposed a **vacuous invariant**. |
| M5 | `trustshell init` | **DONE 2026-08-15, scope corrected.** `scripts/trustshell-init.mjs`, 46 assertions in `scripts/check-init.mjs`. Detects project and user settings, installs a `Stop` hook, dry run by default, backs up, idempotent, preserves foreign hooks, refuses malformed JSON, `--uninstall` restores. **End-to-end VERIFIED:** installed into a settings.json, invoked the hook exactly as Claude Code would (`CLAUDE_TRANSCRIPT_PATH` set), and a receipt with claim checking landed in SQLite — `ts_4x5bpkzlrf7eweti`, marker NOT CHECKED, hook exit 0. §7.3's crash-swallowing is asserted by **running** a failing command through the wrapper, not by reading it. Five mutations caught. **MCP tools deliberately not built** — §12 Q3 decided, see §9. **NOT CHECKED: never run against a live Claude Code session**, because that mutates the running environment; verified against real settings files instead. |
| M6 | Dogfood | **RUN 2026-08-15, criterion PARTIALLY UNMET.** `docs/TRUSTSHELL-M6-DOGFOOD.md`, reproducible via `scripts/trustshell-dogfood.mjs`. **1 real session exists in this container, not 10** — stated, not papered over. On it the harness raised **zero** findings, and all six failed/denied calls were audited by hand to confirm the zero is a true negative rather than a dead check. The session contains **six documented defects and the harness would have caught none of them**: five involve a tool call that exited 0, which is the A6 class and T2 by construction. **Recall 0/6.** The shapes T0/T1 detect occurred zero times in 205 tool calls; the shape they cannot detect occurred six times. That is a prioritisation signal for T2, not a bug. |

M6 is the deliverable that matters. "We ran it on our own agent and here is what
it caught" is a stronger demo than any dashboard.

## 11. What would make this fail

Stated up front so they can be watched:

- **Transcript format churn.** Claude Code's JSONL is not a public API. Mitigation:
  pin a parser version, keep `transcript_sha256` so old receipts stay verifiable,
  fail loudly on unknown record types rather than skipping them.
- **T1 false positives.** Prose is not a claim language. If "the build is green"
  cannot be reliably linked to its evidence, T1 degrades to noise. Mitigation:
  measure before shipping; ship `NOT CHECKED` rather than a guess.
- **Nobody wants receipts.** The honest risk. The buyer for "prove your agent did
  what it said" may be compliance, not developers — and compliance does not
  install MCP servers. M6 is partly a market test, not just an engineering one.
- **The harness confabulates.** A verifier that reports a clean session it never
  checked reproduces §1 inside the product. Mitigation: `claims_unchecked` is a
  first-class field, and any internal error marks the receipt `NOT CHECKED`,
  never `VERIFIED`.

## 12. Open questions

1. ~~**Receipt storage**~~ — **DECIDED 2026-08-15: local SQLite first.** Private
   by default, nothing to misconfigure, and no RLS policy to get wrong — this
   project already carries two tables at `USING (true)` for `anon` (LESSONS S1)
   and a live enterprise key readable from the browser bundle. Implemented in
   `receipt/store-sqlite.ts` on built-in `node:sqlite`, so no new dependency and
   no native module. Publishing to Supabase stays a **separate, explicit step**,
   so "recorded" and "published" cannot be confused. Availability is a
   three-outcome question: on a runtime without `node:sqlite` the store reports
   unavailable and the caller records NOT CHECKED — building, hashing, signing
   and verifying are all pure and work everywhere.
2. ~~**Signing key custody**~~ — **DECIDED 2026-08-15: per-developer local key.**
   `--sign` reads `TRUSTSHELL_SIGNING_KEY` and **refuses to generate one**: a key
   invented on first run produces receipts signed by something nobody kept, which
   looks like provenance and carries none. `identity/did.ts` gained
   `keyPairFromSeed` for this.
   **The consequence is carried in the data, not in a README.** A receipt signed
   by the developer whose agent produced it is *self-attested* — it proves the
   bytes are unchanged, not that anyone independent looked.
   `attestation.kind` is `self` / `org` / `unsigned`, and
   `verifyReceiptSignature` returns `independentlyAttested` separately from
   `outcome` so a surface cannot render the two with the same chrome. §8's
   re-derivation path — recompute `audit_hash` from the same transcript bytes,
   no key, no trust in the signer — remains the real proof; the signature is
   convenience.
3. ~~**Does the marker belong in-session?**~~ — **DECIDED 2026-08-15: no.** CLI
   and file output only. The original reason stands (MCP output is visible to the
   agent, which can then discuss its own score), and the M5 build added a second:
   the MCP namespace is already occupied by `@hyperdag/trustshell-mcp`, whose
   `verify_output` tool means something else entirely. See §9.
4. **RepID linkage** — bind a session receipt to an `agent_kya_registry` row, or
   keep developer sessions entirely separate from the agent registry? These are
   different trust domains and conflating them early would be hard to undo.
5. **Why an M2 receipt says `NOT CHECKED`, and why that is not a shortfall.**
   Claim checking does not ship until M4, so `claims_total`, `claims_unchecked`
   and `claims_failed` are all zero. A naive "nothing failed" test reads that as
   success and renders `✓ VERIFIED  0 claims · 0 backed`. That is §1's defect
   reproduced inside the product, and it is the *fourth* instance of the shape in
   this repo — after the 6/6 E2E against a service that never ran a round, the
   green build over two undefined references, and the credential check that
   passed with no credential.
   `markerFor` therefore returns `NOT_CHECKED` **unconditionally** while no claim
   tier is enabled, and an internal error forces the same. `checkReceipt` takes
   the **floor** of its parts, never the ceiling: a perfect signature over data
   nobody checked is still `NOT CHECKED`. Both rules are asserted, and both were
   confirmed by mutation — removing the first makes an M2 receipt print
   `✓ VERIFIED  0 claims · 0 backed`, which is exactly the output the rule exists
   to prevent.
