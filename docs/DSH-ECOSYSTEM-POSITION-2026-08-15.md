# The DSH ecosystem, read against ours — and where we actually stand

**[VERIFIED 2026-08-15 by reading source and the GitHub API. Two independent
passes: a local read of cloned repos, and a separate search pass. Grok's
synthesis was read only AFTER both, and is treated below as a hypothesis to
test, not a source.]**

## 0. The one-line finding

The ecosystem converged on **content addressing** in the last few days — five
or more projects, plus Ouroboros, independently shipped SHA-256 receipts. **Every
one of them stops at the hash.**

A digest proves the bytes did not change. It cannot answer:

1. **Who vouched for these bytes?** → needs a signature over a named identity
2. **Can that assertion travel off this host?** → needs a portable artifact
3. **Was the voucher ever right before?** → needs earned, portable reputation

Those three questions are exactly `work-contract.ts` → `verdict-envelope.ts` →
zkRepID. **That is the unclaimed ground, and it is the whole product.**

---

## 1. Scale, so nobody under-rates this ecosystem

| | measured |
|---|---|
| repos carrying `dsh-plugin` | **~3,950–3,990** (topic page and search API disagree slightly) |
| `deepseek-ai/deepseek-harness` stars | **113,715** |
| `Q00/ouroboros` stars | **5,421** — and it does carry the `dsh-plugin` topic |
| highest-starred *security* repo in the topic | **28** (`openguardrails`) |

The star curve for security sits about **three orders of magnitude** below the
capability curve, and nearly every DSH security plugin was created 2026-08-13 →
08-15 with 0–4 stars. This is a very large, very young ecosystem whose safety
layer is days old.

---

## 2. Where Grok was wrong — corrections that change strategy

Grok's synthesis is directionally sound and its architecture advice is good. Four
specifics do not survive checking, and two of them change what we should claim.

### 2.1 The "third-party audit" of DSH does not exist — REFUTED

Grok wrote: *"Critical weakness (third-party audit): Axis A … Axis B (plugin
code) has essentially no security design."*

There is **no such audit**. Searches for the term "Axis B" in this context return
nothing; issue searches on `deepseek-ai/deepseek-harness` for plugin
sandbox/permissions/signature/supply-chain return **0**. "Axis A / Axis B" is
Grok's own framing presented with an audit's authority.

**The underlying substance is directionally right, and I checked it myself
rather than inheriting it:** grepping the DSH tree for
`signature|integrity|provenance|checksum|sigstore` returns only false friends —
`fatalSignatures`/`denialSignatures` are string patterns for matching failure
*messages*, and "signature directory" refers to API method signatures. **No
plugin signing, integrity gate, or provenance check exists in DSH.** But that is
my grep, not an audit, and it must be cited that way. A fabricated citation is
the exact failure mode this repo retracts numbers for.

### 2.2 x402-paid verification already exists in their ecosystem — REFUTED

Grok lists "x402 verification economics" as **missing**, ours to own.

`BlockRunAI/dsh-clawrouter` (9★): *"A safety gate for DeepSeek Harness: a
stronger model reviews dangerous tool calls before they run … **paid per request
over x402**."*

That is our thesis — pay for a second opinion — already shipping. **We are not
first to price verification.** What they do not have is any way to tell whether
the reviewing model was *ever right*, or to carry that judgement anywhere. Our
claim must narrow from "we invented paid verification" to **"we make a paid
verdict portable and its issuer accountable."** Narrower, true, and still
unclaimed.

### 2.3 Provenance is not absent — REFUTED

At least five projects ship content-addressed provenance:
`dsh-capability-receipt`, `dsh-profile-lock-proof`, `dsh-lineage`,
`dsh-context-provenance`, `dsh-instruction-audit`. All hash-based, all days old.

### 2.4 Ouroboros does more integrity work than Grok credited — UNDERSTATED

Grok called it "no cryptographic accountability." Ouroboros has:

- `cli_version_attestation.py` — SHA-256 of the executable **plus** device/inode
  and symlink-chain comparison, **fail-closed**: *"executable version changed
  after runtime initialization; start a new execution session."*
- `trust_store.py` — trust keyed by `(source.type, source_identity,
  artifact_digest)`, where *"ANY field changing voids the grant — that closes the
  same-name reinstall and code-substitution paths."*

That is serious supply-chain thinking. It is **content-addressing plus local user
approval, not public-key attestation** — it proves bytes did not change, never
*who* vouched, and nothing leaves the host.

**Confirmed absent, and this is the important part:** no signing anywhere
(`hmac|ed25519|rsa|gpg|sigstore` → 0 results), no DID, and **no measured
evaluator accuracy** — searches for `precision`, `"ground truth"`,
`"false positive"`, `calibration` return **0**. Ouroboros measures drift,
stagnation and ontology similarity: **self-consistency metrics that never ask
whether the judge agrees with reality.** Its 2-of-3 multi-model consensus is a
voting rule with no accuracy record behind it.

That is the same open problem `veritasSignal()` refuses to close by accident —
and they have not noticed it is open.

---

## 3. What I found that neither Grok nor the scan framed: DSH chose anti-identity

DSH's entire `identity` package is **one file**: a random UUID for telemetry.
From its own header:

> *"never derived from the hostname, network address, git remote, or any other
> identifying source … deleting the file mints a fresh identity on the next
> launch."*

**This is not weak identity. It is deliberate anti-identity** — a correct privacy
decision, made in a system with no primitive that could deliver accountability
and privacy at the same time. Its `guard` package is `timeout-policy` and
`repeat-tool-reminder`: loop hygiene, not authority.

**We are not in that bind, and this is the strategic point.** zkRepID's
unlinkability comes from **scope-varying nullifiers**, not from discarding
identity. So we can offer the accountability DSH gave up **without taking back
the privacy it was protecting**. Anonymous *and* accountable is the thing on
offer, and it is why we can occupy ground they cannot reach by trying harder —
they would have to abandon a design principle.

---

## 4. What they do better than us — take these

Honest direction of flow. Not everything points our way.

| theirs | why it is better | ours |
|---|---|---|
| **`session-persistence-jsonl`** — append-only event log per session with **torn-frame recovery** (snapshot before appending a recoverable prefix; computes the byte offset safe to append at) | Real durability engineering. A crash mid-write does not corrupt the log | We have `TurnRecord` in memory and no durable append-only log at all |
| **Ouroboros staged evaluation** — Mechanical ($0) → Semantic → Consensus ($$$), escalating only on failure | Cost discipline by construction | Our Evaluator port allows this; nothing implements the cheap tier |
| **Ouroboros cost-aware routing** — Frugal 1× → Standard 10× → Frontier 30× | Verification and generation have different economics | We instrument cost but do not route on it |
| **Multica `mat_` task tokens** — server-minted, task-scoped, and the runtime *"narrowly forwards only"* that token | Capability attenuation done plainly | Our ControlProof is stronger in theory; theirs is shipping |
| **DSH seam/plugin composition** | Swap model, tools, sandbox without touching core | We have exactly one seam (Evaluator) |

**Do not take:** the plugin trust model. Anything that can influence a verdict or
memory must be a principal with an identity, not ambient host code.

---

## 5. What I built this session, and why it is this and not architecture

`lib/trustshell/identity/verdict-envelope.ts` — **the portable artifact the
"portable trust harness" is named after.**

The gap was precise and embarrassing: `verifyVerdict()` already did the
cryptography correctly, but its signature is `{ verdict, contract }` — it needs
**both**, and nothing carried them together. So "can a third party check this?"
answered *yes, if they already hold the contract*, which for an outside party is
no. **There was no artifact to hand anyone.**

The envelope is one JSON object, offline-verifiable, needing no database, no
network and no access to us — because `did:key` is self-certifying: the public
key *is* the identifier. It also sidesteps the blocker that stopped W2: no
DID→`repid_agents.id` mapping is required, because nothing here consults our
database.

It is the only module in `identity/` that eats **hostile input**, so `envelope`
is typed `unknown`, validated field by field, and `verifyEnvelope` **never
throws** — a caller's `catch` must not get to decide what "unverifiable" means.

**22 assertions, 8/8 mutants killed.** The first mutation run had a survivor —
removing the version check left the suite green because the only wrong-version
fixture was *also* unsigned, so a later check caught it and the version gate was
never under test. Fixed with a well-formed v99 envelope; the mutant now dies.

**One caveat, pinned in a test rather than left to be discovered:**
`evidenceMatches: true` means *"renders to the same evidence the judge saw"*, not
*"byte-identical"*. `renderEvidence` projects turns down to
`{turn, progress, calls, observations}` and the digest covers the projection.
Coherent — the judge only ever saw the projection — but narrower than the field
name suggests.

---

## 6. Where Grok and I align — build these next

1. **Staged evaluation** (mechanical → semantic → panel). Both of us, and
   Ouroboros, arrived here independently. The Evaluator port already permits it.
2. **Durable append-only session log**, with DSH's torn-frame recovery as the
   reference implementation.
3. **The doer-seat reputation signal** — still the highest structural priority,
   still blocked on the DDL and the DID mapping (W2).
4. **Cost-per-verified-outcome**, which is §4.4 of the design doc and unmeasured.

## 7. Where we diverge — log, do not build

- **Grok wants seams for SessionLog / ToolPolicy / Memory / Payment now.** I
  would not. We have five modules already built and unwired; five more seams with
  no implementations behind them makes that worse, and the Evaluator port shows a
  seam costs nothing to add *later* once there are two things to swap.
- **Grok positions us as "the accountable verifier other harnesses call."** I
  agree on substance but not yet on claim: `dsh-clawrouter` already sells paid
  review, and until a doer/checker pair fires on different DIDs in one measured
  loop we are selling a design. **Shadow it: publish the envelope format, let
  someone verify one, and measure whether anybody does.**

## 8. NOT CHECKED

- DSH's plugin loader source — I grepped for signing primitives and found none,
  but did not read the loader to confirm the "runs with host privileges"
  mechanic. The README body was not read (default branch is `master`; a `main`
  fetch 404'd).
- Source of seven provenance/payment repos — read by description and topic only.
  `dsh-clawrouter`'s x402 integration is quoted from its description, not its code.
- `AgentConnect/dsh-awiki`, described as an "AWiki identity and messaging plugin"
  — the one repo that could plausibly touch agent identity. Not read.
- Whether Multica or DSH run at all in our environment. Neither was built or
  executed.
- Any claim about relative reliability or quality. Nothing here was benchmarked.
