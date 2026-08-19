# HAL replay — operator checklist

**Status: BLOCKED, never run. 147,704 classifications, 0 receipts.**

This is the single highest-leverage measurement available for issuer quality
(Gate 2 / issuer-staking). It is built, asserted and refusing to start.

Everything below is measured, not assumed. **No credentials are invented here.**
If a value is not in this document, it is because nobody in an agent session can
see it.

---

## 0. What is actually true right now

| fact | value | measured |
|---|---|---|
| `hal_classifications` rows | **147,704** | 2026-08-17 |
| corpus span | 2026-05-02 09:34 → 2026-08-16 09:15 | 2026-08-17 |
| `kya_compliance_receipts` with `receipt_kind='hal_classification'` | **0** | 2026-08-17 |
| other receipts in that table | 12 | 2026-08-17 |
| idempotency index | `kya_receipts_hal_classification_uniq` — partial UNIQUE on `hal_classification_id` | present |
| `audit_hash` nullable? | **YES** | present |

The corpus is ~1 row/day since 2026-07-18 — see the Railway outage entry in
`PRIOR-WORK-INDEX.md`. **The replay measures history; it does not need the fleet
back up.**

---

## 1. THE IRREVERSIBILITY WARNING — read before running

`audit_hash` is **nullable** and the idempotency index is a **partial UNIQUE**.
Those two facts combine badly:

> A run under a missing or weak secret writes 147,704 receipts that **nobody can
> verify** — and idempotency then **REFUSES to let you re-mint them correctly**.
> The only recovery is a mass DELETE of production receipts.

The script therefore **refuses to start** rather than degrade. That refusal is
the safety property; do not work around it. All four refusal paths were run, not
read:

```
unset secret       → names TRUSTSHELL_HMAC_SECRET
whitespace / short → "5 characters; at least 16 are required"
abandoned default  → refused BY NAME (26 chars, clears the length rule)
no DB credentials  → names SUPABASE_URL and SUPABASE_SECRET_KEY
```

---

## 2. Required secrets — what, and where they must live

| variable | requirement | why |
|---|---|---|
| `TRUSTSHELL_HMAC_SECRET` | **≥16 characters.** Must NOT be `trinity-default-sbt-secret` | The receipt audit hash is an HMAC. Without it the hash is computed under a constant and anyone holding this repo can forge one. The abandoned default is published in this repository's git history and is refused by name. |
| `SUPABASE_SECRET_KEY` | an `sb_secret_…` key | Resolves to the `service_role` Postgres role, which has `rolbypassrls = true`. Reading 147k rows and writing receipts needs it. |
| `SUPABASE_URL` | `https://qnnpjhlxljtqyigedwkb.supabase.co` | Project ref is not a secret; the key is. |

**Where they must live — and where they must NOT:**

- ✅ The environment of whatever host runs the script. A shell export in an
  operator session is fine for a one-off.
- ✅ A secret store the runner reads at execution time.
- ❌ **NOT a GitHub Actions secret for the current workflows.** Measured
  2026-08-17: `grep -rho "secrets\.[A-Z_]*" .github/workflows/` returns
  **nothing** — neither workflow references any secret, so adding one changes
  nothing until a workflow is written to consume it.
- ❌ **NOT in the repo.** `npm run check` includes a secret scanner and a git
  history scan; a committed key fails the build, correctly.
- ❌ **NOT the Supabase vault.** Checked 2026-08-17: `vault.decrypted_secrets`
  is **empty**, and the script reads `process.env`, not the vault.

**This cannot be run from a sandboxed agent session.** Verified: no
`TRUSTSHELL_HMAC_SECRET`, no `SUPABASE_SECRET_KEY`, empty vault, and
`qnnpjhlxljtqyigedwkb.supabase.co` is proxy-denied to `curl`. The Supabase MCP
tools reach the database but the Node script does not, and computing the HMAC
through SQL would require putting the secret into a query — which would land it
in logs. **Operator-only.**

---

## 3. The run

```bash
export TRUSTSHELL_HMAC_SECRET='…'          # ≥16 chars, not the abandoned default
export SUPABASE_URL='https://qnnpjhlxljtqyigedwkb.supabase.co'
export SUPABASE_SECRET_KEY='sb_secret_…'

# 1. DRY RUN FIRST. Computes every preimage and audit hash, writes NOTHING.
node scripts/hal-replay.mjs --dry-run --limit 100

# 2. A small real batch. Confirms the insert shape against the live constraint.
node scripts/hal-replay.mjs --limit 100

# 3. The full corpus. Resumable; safe to re-run.
node scripts/hal-replay.mjs
```

Flags: `--dry-run`, `--limit N`, `--batch N` (clamped 1–1000, default 250),
`--after ID` (resume).

**Exit codes are the verdict** — the repo's three-outcome contract:

| exit | meaning |
|---|---|
| `0` | VERIFIED — corpus complete, nothing left unattempted |
| `2` | NOT_CHECKED — interrupted; rows remain. **Not a failure, and not a pass.** |
| `1` | FAILED — stopped on the first non-`23505` error, printing a resume cursor |

On any real error it stops and prints
`Resume with: node scripts/hal-replay.mjs --after <id>`. It does **not** grind
through logging failures, because that leaves a corpus that is partly minted
with no record of which rows are missing.

---

## 4. What "unambiguously succeeded" looks like

The first successful run is unambiguous when **all four** hold:

1. Final line reads `hal-replay — VERIFIED — minted <n>, already present 0,
   failed 0, not attempted 0`, and the process exits **0**.
2. `select count(*) from kya_compliance_receipts where receipt_kind='hal_classification'`
   returns **147,704** (or the corpus count at run time).
3. `select count(*) from kya_compliance_receipts where receipt_kind='hal_classification'
   and audit_hash is null` returns **0**. A single null here means the corpus is
   poisoned and idempotency will block the fix — stop and escalate.
4. Re-running the script exits **0** with `minted 0, already present 147704`.
   That is idempotency proving itself, and it is the check that distinguishes a
   real completion from a lucky one.

---

## 5. What the replay EMITS once unblocked

The replay itself mints receipts. The measurements below become computable from
that corpus — they are **not** produced by the script and are listed so the
first run is not mistaken for the analysis.

| measure | how it is computed | status today |
|---|---|---|
| **issuer accuracy** | `hal_validation_runs` joined to minted receipts, stratified by `hal_decision` | **DARK** — pooled `hal_score` anti-correlates with correctness (Simpson's paradox); it must be stratified or it misleads |
| **no-provider veto rate** | share of classifications where the detector called no provider yet a veto fired | **DARK** — 41 such vetoes already recorded by another lane |
| **latency** | not stored per classification | **NOT AVAILABLE** — no column holds it; do not report a latency figure from this corpus |
| **cost** | not stored per classification | **NOT AVAILABLE** — same |

**Two of the four are not in the data.** Reporting a latency or cost number off
this replay would be inventing it. If those are wanted, they need a column and a
writer first.

Held-out discipline applies to anything derived here: a **+9.26pp** in-sample
improvement on this corpus collapsed to **+0.16pp** on a run-split holdout. Split
before believing.

---

## 6. What this does NOT do

- It does **not** claim the classifications were correct. A receipt records that
  a classification HAPPENED and pins its fields under an audit hash.
- `bft_passed` is **NULL**, not false — no panel voted. Every one of the 12
  pre-existing receipts had to be retracted because a placeholder recorded a
  pass for a vote that never happened.
- `kya_verified` is **false** — no KYA check runs on this path.
- Payment fields stay NULL, enforced by the shape constraint.
