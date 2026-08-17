# Red team baseline — 2026-08-16

First campaign of the constructive red team capability
(`.claude/skills/trust-red-team/SKILL.md`, `npm run check:redteam`). Seven
probes, all executed. Reproduce with:

```bash
npm install && npm run check:redteam            # or --json for the transcripts
```

---

## Executive summary

**Posture: the trust arithmetic is in better shape than the trust plumbing.**

Every probe aimed at the *computational* core held under attack, several
decisively: spending-limit type confusion, receipt preimage commitment, and
RepID's self-asserted-input path all refused everything thrown at them, with
transcripts. The findings that survived are all at the seams — a gate that never
got wired to the signature primitive sitting next to it, a verdict whose caveat
lives in a field its own summary never mentions, a string comparison.

**Three headline findings**

1. **PAY-001 (High)** — the dual-signature gate on the payment path verifies no
   cryptographic material. It counts distinct caller-supplied `role` strings, so
   `[{"role":"CFO"},{"role":"CTO"}]` satisfies the control that is described to
   institutions as dual authorization.
2. **HAL-001 (Medium)** — `verifyHalChain` returns `VERIFIED` for a truncated
   chain. Measured by exhaustive search: **no input produces `VERIFIED` with
   `windowStartUnverifiable: false`**, so every `VERIFIED` it can emit is over a
   window whose beginning is unexaminable — and the `detail` string never says so.
3. **RCPT-001 (Low)** — the guard against the published abandoned HMAC default
   is an exact-string comparison, so case variants of the same public constant
   are accepted.

**Immediate actions**

- PAY-001: wire the gate to `countersignContract` — the two-party signature over
  canonical bytes the repo already ships. It is Sean-gated (a live authorization
  path), so it is logged rather than applied.
- HAL-001: make `outcome` carry the truncation, or at minimum name it in
  `detail`. Cheap now — the verifier has no production caller yet.
- RCPT-001: normalise case before comparing. One line.

**Also established, and not a vulnerability:** both live surfaces currently
**fail closed** on receipt minting, and they are on **different commits**. See
LIVE-001 — that is an availability finding, and it is why PAY-001's live impact
is bounded today.

---

## Findings

### PAY-001 — Dual-signature gate accepts unauthenticated role strings

| | |
|---|---|
| **Component** | TrustShell / payment path (x402-adjacent) |
| **Severity** | High |
| **Status** | Open, ledgered, owner **Sean**, review by 2026-09-15 |

**Description.** `app/api/trustrails/pay/route.ts` promises that a transfer above
50,000 USDC requires two co-signatures from distinct institutional roles. The
gate destructures `signatures` from `await req.json()` and applies two tests:
`signatures.length >= 2`, and `new Set(signatures.map(s => s.role)).size >= 2`.
There is no third test. No key, no payload, no signature bytes — the word
"signature" in that control names a string field, not a signature.

**Evidence.** Every line in the route that mentions `signatures`:

```ts
const { agentName, amountUSDC, recipientAddress, purpose, signatures } = await req.json();
if (!signatures || signatures.length < 2) {
const roles = new Set(signatures.map((s: any) => s.role));
message: 'Dual signatures must come from distinct institutional roles (e.g., CFO and CTO). CFO and CFO cannot dual-sign together.',
```

The probe searched the route for every verification primitive this repository
ships — `verifyControlProof`, `verifyDelegationChain`, `verifyWorkContract`,
`verifySignature`, `verifyVerdict`, `verifyHarness`, `countersignContract`,
`subtle.verify`, `crypto.verify`, `ed25519`, `nacl` — and found **none**.

Payload that satisfies the gate with zero cryptographic material:

```json
{"agentName":"<registered>","amountUSDC":75000,"recipientAddress":"<addr>",
 "purpose":"x","signatures":[{"role":"CFO"},{"role":"CTO"}]}
```

**What this does NOT establish.** It is **source-derived, not an observed live
bypass.** It establishes that no verification primitive is reachable from this
route; it does not establish an observed 200 from a live host. Both custom
domains are proxy-denied from an agent session, and a local server needs
credentials this session does not hold. The live confirmation is one request and
is recorded on the probe itself: a 403 at stage `dual_signature_gate` would
refute this; anything past that stage confirms it.

**Impact.** The strongest control on the highest-value path is satisfied by a
caller naming two roles. Reachability is bounded *today* by LIVE-001 — both
surfaces fail closed on receipt minting, so the path is not issuing receipts —
but that is an accident of configuration, not a control, and it reverses the
moment a secret is set.

**Recommended fix.** Do not invent a scheme. `lib/trustshell/identity/work-contract.ts`
already implements `countersignContract`: a two-party signature over canonical
bytes, with the guard that the two parties must differ. A CFO/CTO co-signature
is exactly that shape. The gate should require a countersigned payload binding
`{paymentId, agentName, amountUSDC, recipientAddress}` and check the two signer
DIDs against the institution's registered role holders — so role *distinctness*
becomes a property of the keys rather than of the strings.

**Re-test.** `npm run check:redteam -- --probe PAY-001` — HELD once a
verification primitive is reachable from the route. Then the live request above
against a surface with a valid audit secret, expecting a 403 at
`dual_signature_gate` for an unsigned payload.

---

### HAL-001 — `VERIFIED` is only reachable on a window that cannot be anchored

| | |
|---|---|
| **Component** | HAL / audit chain |
| **Severity** | Medium |
| **Status** | **FIXED 2026-08-17** — probe HELD, ledger entry removed. See Resolution below; the description, evidence and recommended fix below are the historical record of what was found and are left as written. |

**Description.** Two related results, both executed against
`lib/trustshell/hal-chain.ts` over synthetic entries.

*The attack.* Delete the head of a chain and present the tail. Everything
remaining is internally consistent, so the verifier recomputes every link it was
handed, finds them all sound, and returns `outcome: 'VERIFIED'`. It does set
`windowStartUnverifiable: true` — the information is not lost — but the
human-readable `detail` reads, in full: *"all 4 link(s) recomputed and matched
across 5 entries."* A caller gating on `outcome`, which is the shape every
sibling module here uses, accepts a chain whose head was deleted.

*The stronger result.* Rather than assume, the probe searched for a
counterexample: is there **any** input with `outcome === 'VERIFIED'` and
`windowStartUnverifiable === false`? Across chain lengths 1–12, both eras
(pre- and post-cutover), genesis-including and windowed — **none**. The reason is
structural: a chain containing its genesis has one link that cannot be
recomputed, so it degrades to `NOT_CHECKED`; any window avoiding that starts with
a link pointing outside itself, so it cannot anchor its own start. So *every*
`VERIFIED` this verifier can ever emit is over an unanchored window, and
`outcome` alone cannot separate a sound chain from a truncated one.

**Evidence** (excerpt; full transcript from `--probe HAL-001 --json`):

```
untampered genesis chain, correct hasher     -> NOT_CHECKED verified=5 notChecked=1 windowStartUnverifiable=false defects=none
untampered chain, NO hasher supplied         -> NOT_CHECKED verified=0 notChecked=6 windowStartUnverifiable=false defects=none
entry 3 category edited in place             -> FAILED      defects=link_mismatch
entries 2 and 3 swapped (time backwards)     -> FAILED      defects=out_of_order/link_mismatch/...
entry 4 predecessor nulled (post-cutover)    -> FAILED      defects=missing_link_after_cutover/...
two entries claiming the same predecessor    -> FAILED      defects=duplicate_link/...
empty window                                 -> NOT_CHECKED
HEAD DELETED, tail presented as the chain    -> VERIFIED    verified=4 notChecked=0 windowStartUnverifiable=true defects=none
```

**What this does NOT establish.** The verifier's *tampering* detection is sound —
in-place edits, reordering, forks and severed links all FAIL, and a missing
hasher refuses rather than passing. This finding is about one verdict's
composition, not about the verifier being weak. It also says nothing about the
live chain, which remains NOT_CHECKED for want of the producer's hash formula.

**Impact.** Latent rather than live: the verifier has no production caller yet.
That is precisely what makes it cheap to fix now — no consumer has to change.
The failure shape is a known one here: two correct components, one value, two
meanings, discovered only when composed.

**Recommended fix.** Smallest change that closes it: when
`windowStartUnverifiable` is true, either return `NOT_CHECKED` (consistent with
how a single unrecomputed link is already treated) or keep `VERIFIED` and make
`detail` state that the window's start is unanchored. Prefer the first — it puts
the caveat in the field callers actually read.

**Re-test.** `npm run check:redteam -- --probe HAL-001`. HELD requires either
that truncation stops returning `VERIFIED`, or that an anchored `VERIFIED` becomes
reachable and `detail` names the truncation.

---

**Resolution (2026-08-17).** Both halves fixed in `lib/trustshell/hal-chain.ts`,
not just the one this report recommended:

- An unanchored window (`windowStartUnverifiable: true`) now caps the outcome at
  `NOT_CHECKED`, whatever matches inside it — the truncation attack above now
  reads `NOT_CHECKED`, not `VERIFIED`.
- A proven pre-cutover genesis (null link, dated before the cutover) is no
  longer counted as an unrecomputed link — there is nothing behind it to check,
  and the row's own timestamp is the proof. This closes the *other* half the
  exhaustive search found: an anchored `VERIFIED` was unreachable for **any**
  input, not only for the ones this report's battery tried.

Both are covered by dedicated mutation tests (`scripts/mutations.mjs`:
`hal-unanchored-window-reads-verified`, `hal-proven-genesis-counted-as-gap`) and
re-verified against real production rows — a wider window (ids 44758–44779) than
this report's original 16-row pull, chosen specifically to include the true
genesis. See `LIVE_RUN_2026_08_17` in `lib/trustshell/hal-chain.ts` for the
numbers: the identical chained-tail input that read `VERIFIED` here now reads
`NOT_CHECKED`, and the full window (genesis included) reaches a genuinely
anchored `VERIFIED` for the first time. `npm run check:redteam -- --probe
HAL-001` now returns HELD.

---

### RCPT-001 — Receipt secret guard is an exact-string match against a published constant

| | |
|---|---|
| **Component** | TrustShell / compliance receipts |
| **Severity** | Low |
| **Status** | Open, ledgered, owner **unassigned**, review by 2026-09-15 |

**Description.** `requireAuditSecret` refuses the abandoned in-source HMAC
default via `secret.trim() === ABANDONED_DEFAULT_SECRET`. The comparison is
case-sensitive, so case variants of the same published constant are accepted.

**Evidence.**

```
requireAuditSecret(unset                                  ) -> refused
requireAuditSecret(empty string                           ) -> refused
requireAuditSecret(whitespace only                        ) -> refused
requireAuditSecret(one char under the length floor        ) -> refused
requireAuditSecret(the abandoned default, exactly         ) -> refused
requireAuditSecret(the abandoned default, space-padded    ) -> refused
requireAuditSecret(the abandoned default, tab/newline-pad ) -> refused
requireAuditSecret(the abandoned default, UPPER-CASED     ) -> ACCEPTED
requireAuditSecret(the abandoned default, first cap'd     ) -> ACCEPTED
requireAuditSecret(a real 24-char secret — ANCHOR         ) -> ACCEPTED
```

**What this does NOT establish.** No live surface holds a variant — LIVE-001
evidence, same day. This is a defence-in-depth gap in a control that is
otherwise working, not an active forgery path. Severity is Low for that reason,
not because a forged compliance receipt would be a small problem.

**Impact.** The guard's own comment names the return path exactly: *"the most
likely way this weakness comes back is somebody 'fixing' the missing variable by
pasting the constant the old fallback used."* An operator pasting from a
dashboard field that upper-cases gets a "secret" that is public.

**Recommended fix.** Compare a normalised form — `secret.trim().toLowerCase() ===
ABANDONED_DEFAULT_SECRET.toLowerCase()`. One line, in `isAbandonedDefaultSecret`
so both callers get it.

**Re-test.** `npm run check:redteam -- --probe RCPT-001`.

---

## What held, and what that is worth

These are not blanks. Each ran a full battery with anchors and refused everything.

**PAY-002 — spending-limit type confusion (Critical if broken).** Twenty hostile
inputs across `checkPerTxLimit` and `checkDailyLimit`: `NaN`, negative, `±Infinity`,
`1e309`, numeric strings, `null`, `undefined`, `{}`, `[]`, `[50]`, plus the mirror
case of a hostile *limit*, plus an unreadable spend history. **Every one returned
NOT_CHECKED or FAILED**, and both anchors still returned VERIFIED. The classic
`NaN > limit === false` fail-open is not present. This is the single most
valuable HELD in the campaign — it is the attack that leaves no trace in a log.

**RCPT-002 — receipt audit preimage (Critical if broken).** All nine declared
`PaymentAuditInput` fields are committed to (each mutated in turn; the preimage
moved every time), the domain is tagged, and eighteen near-collision variants —
`null` vs `"null"` vs `"no_tx"` vs `""`, `true` vs `"true"`, `null` vs `0`,
separator injection carrying `":"` and a quote, field swaps — **all encode
distinctly**. The `no_tx` sentinel collision recorded in prior work is closed and
stays closed.

**REPID-001 — self-asserted authority (High if broken).** An agent with zero
measured behaviour and a self-asserted `humanCustody` flag scores **613** and
lands in **Bronze** (daily 1,000 USDC, per-tx 100). Even stacking a second
self-asserted input — `latencyMs: 0` passed for "unknown" — reaches only 1,796,
still Bronze. No self-asserted-only configuration reaches a funded tier.

**LIVE-001 — live surface configuration (Critical if broken).** Judged against
evidence collected via `pg_net` (both domains are proxy-denied to `curl` here).
Neither surface would mint under a published secret. See below — the *reason* is
worth reading.

---

## Two corrections this campaign made to itself

Recorded because the mechanism that caught them is the deliverable, more than the
findings are.

**A fabricated-findings near-miss.** The receipt probe's first draft sent
`txHash`; the real `PaymentAuditInput` field is `solanaTxHash`. Every variant
therefore differed in a key the preimage never reads, all eleven "collided" with
the base, and the run reported **four Critical preimage collisions** that do not
exist. Nothing in review would have caught it — the output was plausible and
internally consistent. What caught it was the field-coverage anchor. `RCPT-002`
now asserts that every declared field moves the preimage, so a field added to the
interface and not to the probe is loud rather than silently untested.

**A severity that was backwards.** The `LIVE-001` probe was first written with a
hardcoded table ranking `abandoned_default` as *fails open* — receipts minting
under a public secret. Live evidence showed `www` reporting exactly that word,
which made the question load-bearing, and executing `requireAuditSecret` settled
it: the abandoned default is **refused**, so the surface fails *closed*. The
probe now derives the meaning of each status word by driving the minting code
instead of carrying its own table, so it cannot drift again — and if the refusal
is ever removed, it turns red against live evidence with no edit.

---

## Live surface state, 2026-08-16 17:16 UTC

Collected via `pg_net`; verbatim responses in `scripts/redteam/evidence/`.

| surface | platform | commit | `TRUSTRAILS_HMAC_SECRET` | effect |
|---|---|---|---|---|
| `www.aitrinitysymphony.com` | Vercel | `6e00ae0` | `abandoned_default` | mint path **refuses** — fails closed |
| `app.aitrinitysymphony.com` | Railway | `4a999bc` | `missing` | mint path **throws** — fails closed |

Two things worth stating plainly. **Receipt minting is unavailable on both
surfaces** — an availability finding, not a clean bill, and the reason PAY-001's
live impact is bounded today. And the surfaces are on **different commits**, so a
finding on one says nothing about the other; that is the separate-environment
split, working as designed, and it is a standing trap for any conclusion drawn
from a single probe.

---

## A measured update to a prior figure

`reachableCeiling()` now reports **10,000**, and driving a flawless agent through
the real path (`normalizeMetrics` → `contributionsOf` → `scoreFromWeightedSum`)
produces **10,000** — the two agree. Tier floors sit at 75% / 50% / 25% of that.

This supersedes the earlier ceiling figure recorded against `repid-scoring.ts`;
the curve was recalibrated after it was written. Anyone sizing a RepID finding as
a percentage of the ceiling must re-measure rather than cite. `REPID-001` now
drives the ceiling against the scoring path on every run, so the two cannot
silently diverge again.

---

## Coverage map

| area | status |
|---|---|
| Spending-limit type confusion | **TESTED** — 20 inputs, HELD |
| Receipt preimage commitment and collisions | **TESTED** — 9 fields + 18 variants, HELD |
| Receipt secret guard | **TESTED** — 10 variants, 2 BREACHED |
| RepID self-asserted authority, ceiling agreement | **TESTED** — HELD |
| HAL chain tampering / reorder / fork / severed link | **TESTED** — HELD (all FAIL correctly) |
| HAL chain truncation and verdict reachability | **TESTED** — BREACHED |
| Live surface secret configuration | **TESTED** via `pg_net` evidence — HELD |
| Payment dual-signature gate | **SOURCE-DERIVED ONLY** — no live confirmation available from an agent session |
| `/api/trustshell/control-proof/verify` audience oracle | **NOT CHECKED** — needs a running server; audience is a module constant on inspection, unverified by execution |
| Replay across serverless instances | **NOT CHECKED** — per-instance nonce store by design; the durable migration is unapplied |
| BFT panel veto semantics, cross-LLM quorum poisoning | **NOT ATTEMPTED** — next campaign |
| x402 settlement replay / double-settle | **NOT ATTEMPTED** — next campaign |
| ERC-8004 on-chain identity and reputation manipulation | **NOT ATTEMPTED** — needs Base Sepolia reads |
| Anon RLS write surface (regression on the 2026-08-15 sweep) | **NOT ATTEMPTED** — next campaign; live SQL probe |
| Prompt injection into HAL / the evaluate wrapper | **NOT ATTEMPTED** — needs Garak/PyRIT and a live endpoint |
| Anything post-hydration on a live page | **NOT CHECKABLE** from an agent session |

---

## Residual risk and next campaign

**Residual risk: moderate, concentrated at the seams.** The arithmetic that
decides trust is hardened and now has regression probes standing over it. The
exposure is in wiring — a gate that reaches for a primitive it never got, a
verdict whose caveat lives in a field its summary omits — and in the large
NOT ATTEMPTED column above, which is honestly the bigger number right now.

**Next campaign, in priority order.**

1. **The BFT panel's veto semantics under composition.** Highest expected value:
   the panel is non-monotonic in agreement, and a consumer reading its veto as
   "ask another model" inverts the signal. Probe the panel and every tier that
   reads it, together — the defect only exists in composition, which is exactly
   what a unit suite cannot see.
2. **x402 settlement integrity** — replay, double-settle, and whether a simulated
   execution reports itself as simulated all the way into the receipt.
3. **Anon RLS regression probe.** The 2026-08-15 sweep took anon-writable tables
   57 → 0. Nothing currently detects that reopening. A live SQL probe makes it a
   standing check rather than a one-time sweep.
4. **Live confirmation of PAY-001** — one request, and it converts a
   source-derived finding into an observed one. Needs a collector with network
   reach; the charter section 5 covers the handoff.
5. **Prompt injection into the evaluate wrapper**, using Garak against a live
   endpoint. This is the job to hand to an external agent — it needs egress, a
   Python environment, and time, none of which is available here.
