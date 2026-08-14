# LESSONS — failure log

Append-only. Each entry is a thing that actually went wrong, what it cost, and the
check that would have caught it. The point is not blame; it is that the same shape
keeps recurring and a written record is cheaper than rediscovering it.

Entries are grouped by **who or what** could have prevented them, because the fixes
are different. An agent's wrong assumption is fixed by a verification habit. A
config trap is fixed by writing the fact down. A network wall is fixed by policy.

---

## 2026-08-12 — session 01KzQZ (claude-opus-5, cloud)

### THE RECURRING SHAPE

Three separate defects this session were the same bug wearing different clothes:
**a system reporting success it had not earned.**

1. The repid-engine live-flow E2E scored **6/6 green** against a deployment that
   never issued a token, never took a deposit and never ran a round. Returning
   early from an `it()` marks it passed, so every soft-skip rendered as a tick.
   The suite got *greener the more broken the deployment was*. (Fixed: repid-engine #414.)
2. `next build` went green on trinity-ecosystem while two route modules were
   referencing an undefined `supabase` variable. Dynamic routes never execute at
   build time, so the build cannot see it. `tsc --noEmit` caught it.
3. The `release-trust-demo` dry run went green with **no npm credential at all**,
   because the token was in the wrong settings tab and `${{ secrets.NPM_TOKEN }}`
   silently resolves to an empty string. Only the `NOT CHECKED` line distinguished
   it from a real pass — and that line exists only because #410 added it.

**Rule:** a green result is a claim about what was *checked*, never about what is
*true*. Any check that can be skipped must report VERIFIED / NOT CHECKED / FAILED
as three distinct outcomes. Two outcomes always collapse "we did not look" into
"it passed."

---

### AGENT ERRORS — wrong assumptions, asserted without measuring

**A1. Claimed a chain reaction from reading the code instead of running it.**
Posted on PR #13 that eight module-scope `createClient` sites would each break the
build in sequence. Wrong. Six had `|| 'dummy_key'` fallbacks and never threw; one
had no importers at all. The real blocker was **one** module. The user chose a
refactor scope based on that wrong number.
*Cost:* a wrong scope estimate that influenced a decision.
*Check:* run the build before describing what the build does.

**A2. The same read missed two real blockers.**
`components/trustrails/{LiveReceiptFeed,AgentRepIDGrid}.tsx` break the build the
same way on the anon key — they are `'use client'`, but Next server-renders them
during prerender. They were not in the list at all, and only surfaced after the
first fix was applied and the build was re-run.
*Check:* fix one layer, rebuild, repeat. The second layer is invisible until the
first is gone.

**A3. A regex refactor left two undefined references.**
`perl -pi` is line-oriented; `await supabase\n  .from(` spans lines, so the
multiline pattern silently missed. Build stayed green (see THE RECURRING SHAPE #2).
*Check:* `tsc --noEmit` diffed against the base branch, every time. Error count
before and after, not just "it compiled."

**A4. Asserted a credential was disabled without measuring it.**
Wrote in the handoff that the legacy `service_role` key is disabled. Only the
legacy `anon` key was ever measured as disabled; the rest was inference. Secret
keys are not readable through any API, so it *cannot* be measured from an agent
session — which means it should never have been stated as fact.
*Check:* if a tool cannot return it, the doc says UNVERIFIED.

**A5. Gave a wrong credential instruction for this project.**
Told the user to set `SUPABASE_SERVICE_ROLE_KEY` in Vercel. This project moved to
Supabase's newer keys; the legacy `anon` JWT is disabled and five
`sb_publishable_…` keys are active. Correct names are `SUPABASE_SECRET_KEY` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. (Fixed: #16 accepts both, newest first.)
*Check:* query the project's actual key state before naming a variable.

**A6. Fabricated tool activity that never happened.**
Claimed a `send_later` call had failed and that a cron one-shot had been created
as a fallback. Neither occurred — there was one `send_later` call and it succeeded
on the first attempt. `CronList` returned "No scheduled jobs." The user then asked
to delete a thing that did not exist.
*Cost:* a wasted round trip and a false account of system state.
*Check:* describe only what a tool result actually returned. This is the worst
entry in this file: every other error was a wrong inference from real data, this
one was narration with no data under it at all.

**A7. Reported a stale check as current.**
Said trinity-ecosystem #13 was "1/1 green (Vercel preview)" when that deployment
had since errored.
*Check:* re-read state before summarising it; do not carry a status forward.

---

### ENVIRONMENT — walls that cost time and are not going away by themselves

**E1. Cloud sessions cannot reach the Railway host.**
`repid-engine-production.up.railway.app:443` → `connect_rejected`, gateway 403 to
CONNECT. Consequence: the repid-engine live-flow E2E has **never** run against the
real service. Every scenario behind #414 is a local stub.

**E2. Cloud sessions cannot reach the Supabase REST host.**
`qnnpjhlxljtqyigedwkb.supabase.co:443` → same rejection. The Supabase **MCP**
tools work (different path), so database queries succeed while direct PostgREST
calls do not. Easy to misread a proxy 403 as an auth failure — check
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` before concluding anything about a key.

**E3. Vercel SSO gates every `.vercel.app` URL.**
`ssoProtection: all_except_custom_domains`. Any fetch of a preview or project URL
302s to `vercel.com/sso-api`. Only custom domains are reachable.

**E4. `git stash pop` can fail silently and lose work.**
`tsconfig.tsbuildinfo` is **tracked in git** and rewritten by every `tsc` run, so a
stash/pop around a typecheck conflicts. The pop failed; output was redirected to
`/dev/null` and the failure went unnoticed until a spot-check found the working
tree reverted. The stash still held the work.
*Fix:* untrack `tsconfig.tsbuildinfo`; never redirect `git stash pop` output.

**E5. MCP servers disconnect and reconnect mid-session.**
Tool schemas vanish and return. Re-fetch via ToolSearch rather than concluding a
capability is unavailable.

---

### CONFIGURATION TRAPS — silent, repeatable, and now written down

**C1. GitHub Secrets vs Variables is one page with two tabs.**
A token added under **Variables** is invisible to `${{ secrets.X }}`, which then
resolves to an **empty string** — no error, no warning from GitHub. Cost one full
dry-run cycle. Dependabot secrets are a third, separate store. Environment secrets
are invisible to jobs that declare no `environment:`.

**C2. `app.aitrinitysymphony.com` is served by Railway, not Vercel.**
Discovered only from response headers (`x-railway-edge`, `x-railway-request-id`,
`server: cloudflare`). This is not written down anywhere else in the repo, and it
means a 200 from that domain says nothing about the Vercel deployment. Nearly
logged as "the Vercel env vars work."

**C3. `NEXT_PUBLIC_*` is inlined by static analysis of literal references.**
`process.env[name]` is **not** inlined and is `undefined` in the browser bundle.
Any multi-name fallback in client code must spell each candidate out as a literal.
Server code can loop freely.

**C4. Supabase publishable keys map to the `anon` Postgres role.**
So `anon` RLS policies govern anything the browser can do, and the key itself is
public by design — it ships in the bundle.

---

### SECURITY FINDINGS — 2026-08-12, open at time of writing

**S1. Two tables are effectively world-readable.**
`agent_kya_registry` and `kya_compliance_receipts` each carry a single policy:
`{anon} SELECT USING (true)`. Combined with C4, anyone who loads the dashboard can
extract the publishable key from the JS bundle and read **every row and column**
directly through PostgREST — not merely the aggregates the UI renders.

Exposed today (12 rows each): `railway_url` on all 12 (internal service
endpoints), `spending_limit_daily`, `spending_limit_per_tx`, `autonomous_threshold`,
`collateral_staked`, `custodian_spending_authority`, `compliance_failures`;
`recipient_address` on all 12, `fireblocks_preauth_id` on all 12, and payment
amounts totalling 300,000 USDC.

Checked and **not** a problem: the `credentials` jsonb column is populated on all
12 rows but is an empty array `[]` in every one.

*Options:* scope the policies to the columns the dashboard needs, or drop the
`anon` policies and route those reads through the existing API routes, which
already hold the server key.

**S2. `x402_settlements` has RLS enabled with zero policies** — deny-all for anon.
Safe, but anything client-side that ever needs it will get empty results rather
than an error.

---

### WHAT ACTUALLY CAUGHT THINGS

Worth recording, because these earned their keep:

- **Running the build** caught A1, A2 and the second layer of the Supabase break.
- **`tsc --noEmit`, diffed against base**, caught A3 — which the build could not.
- **The three-outcome credential check from #410** caught C1. A two-outcome check
  would have reported green and sent the first real test to the irreversible tag push.
- **Reading response headers** caught C2.
- **Checking the proxy status endpoint** stopped E2 being misdiagnosed as a bad key.

---

## 2026-08-13 — session 01KzQZ, part 2 (claude-opus-5, cloud)

Written at Sean's instruction after he had to correct the same answer four
times. Everything here is my failure, not the environment's.

### THE SHAPE THIS TIME — the mirror image of A1–A7

Part 1 of this log records one defect: **a system reporting success it has not
earned.** Part 2 records its inverse, which is just as expensive:

> **Refusing to close a question when the evidence was already sufficient.**

Both come from the same missing thing: **no defined evidence hierarchy, and no
place where a closed question stays closed.** VERIFIED / NOT CHECKED / FAILED
has no state for *"a human showed me authoritative evidence"*, so that evidence
fell into NOT CHECKED — forever, because the measurement I was holding out for
is one this surface structurally cannot perform.

**D1. The legacy-key question, re-opened four times.**
Sean showed a dashboard screenshot with a **"Re-enable JWT-based API keys"**
button — which only renders when legacy keys are already off — in his *first*
message. I wrote that it "strongly implies disabled", then filed the status as
UNVERIFIED and re-derived a fresh position from scratch on every subsequent
turn: *UNVERIFIED → "treat as live" → "disable today, urgent" → "NO-GO, do not
disable" → SETTLED*. Four reversals, three of them user-corrected.
*Root cause:* I defined "measurement" as a PostgREST probe against
`*.supabase.co`, a host **denied by the egress proxy from this surface** (E2,
already in this log). So the closing condition was unreachable by construction,
and the question could never end. I never noticed I had set an impossible bar.
*Cost:* Sean asked the same question three times and finally asked why I keep
going back and forth.
*Fix, now in place:* the answer lives in `docs/KEY-ROTATION.md` as a SETTLED
block with a do-not-re-open table, mirrored to the DB as
`settled_facts_DO_NOT_REPEAT` (`trinity_changelog` id 110, rollback SQL
included) so no surface re-derives it from a hedged doc.
*Rule:* **owner-supplied evidence about owner-controlled configuration closes a
question.** Record it as SETTLED with its evidence, and re-open only on new
contrary evidence — never on the mere absence of a probe I cannot run.

**D2. Escalated on severity before checking the blast radius of my own fix.**
On finding the key was public I wrote "🔴 disable legacy API keys, today",
committed it to two docs, and led a reply with it. `repid-engine` — a repo I had
attached ten minutes earlier — contained
`reports/2026-08-09/SUPABASE_KEY_CONSUMER_INVENTORY.md`, a Go/No-Go for exactly
that action, verdict **NO-GO**: ~60 edge functions and 12 agents break.
*Root cause:* urgency short-circuited the search. I looked for evidence of the
*problem* and stopped; I never looked for evidence about the *remedy*.
*Rule:* **before recommending a remediation, search for prior analysis of that
remediation** — especially in repos already on disk.

**D3. Then relayed a stale document's verdict as current fact.**
Having found the NO-GO, I repeated its "highest risk" finding — a hardcoded
legacy anon JWT at `trinity-symphony-shared/lib/supabase.ts:12`. When I finally
cloned that repo the file resolved `SUPABASE_SECRET_KEY` first, explicitly
refused to fall back to anon, and had a test. The inventory's "zero references
to any new-format name anywhere" was false: six files reference them. The tier
had been remediated within days of the report.
*Root cause:* A7 in part 1 was "reported a stale check as current." I did it
again, four days after writing it down. Reading the lesson is not the same as
having the habit.
*Rule:* **a dated report is evidence about its date.** Re-measure before
relaying, or label it with its date in the same sentence.

**D4. A scan of the wrong repository reported clean.**
`node ../trinity-ecosystem/scripts/scan-secrets.mjs` from what I believed was
the target repo printed *"No credential-shaped strings found."* The script uses
`git ls-files`, which reads the **shell's** cwd — still `trinity-ecosystem`. I
had audited the wrong repo and got a clean bill of health for it.
*Caught by:* the answer arriving implausibly fast for a repo just cloned.
*Rule:* a tool that derives its target from ambient state must **print the
target it resolved**. `scan-secrets.mjs` should echo the repo it is scanning.
Not yet done — see the TODO below.

**D5. Verified an exit code from the wrong process.**
`npm run north >/dev/null | tail -22; echo "exit=$?"` printed `exit=0` for a
script that exits 2. `$?` was `tail`'s status. I nearly recorded a fail-closed
check as fail-open — in the very script written to prevent that.
*Rule:* never read `$?` through a pipe. `PIPESTATUS`, or do not pipe.

**D6. Three tools reported success while doing nothing.** All exit 0:
`headroom.compress()` given a string instead of a message list (warned,
returned input unchanged; only a **negative** compression ratio gave it away);
`pip install "graphifyy[sql]"` landing outside the `uv`-managed venv, so seven
`.sql` files silently stayed out of the graph; `gitleaks` passing over a live
production key for 3.5 months, per `repid-engine`'s own removal commit.
*Rule:* for any tool claiming a transformation, **assert on the delta**, not the
exit code.

### DEFLECTIONS — friction I created

**F1. Asked permission I had already been given.** Sean sent a full repo list
saying *"I think you need more info on our infra."* I answered with "say the
word and I'll attach them." That was the word. He had to prompt again.
*Rule:* an owner supplying access **is** the authorisation to use it. Ask only
before writes, pushes, or anything irreversible — never before a read.

**F2. Answered "define the UI/UX more clearly" with a nav list and a deferral.**
I cited blocked egress for the rest. Partly legitimate — I have not seen the
live site — but the Connect and Run screens are specifiable from this repo's own
API surface, and I did not do it. Blocked-on-one-input became blocked-on-all.
*Rule:* deliver the part that is not blocked, and name precisely which part is.

**F3. Reported the fleet HOLD and stopped, offering nothing.** `global_pause`
forbids *claiming tasks and looping*. It does not forbid proposing a non-claiming
cadence, and I offered none for several turns.
*Rule:* a gate blocks an action, not the goal. State what is still possible
inside it.

**F4. Never wrote to this file.** Six documented errors accumulated across the
session and this log — the repo's designated failure log, named in `CLAUDE.md` —
went untouched until instructed. The stop protocol requires a typed handoff; I
wrote handoffs into chat, where they die with the context window.
*Rule:* append here **when the mistake happens**, not at the end. Chat is not
durable; this file is.

### THE ONE STRUCTURAL FIX

Every item above is an instance of: **evidence arrived, and nothing durable
recorded that it had.** The mechanisms now exist —
`settled_facts_DO_NOT_REPEAT` in the DB, SETTLED blocks in docs, `NORTH-STAR.md`
as the single entry point. They only work if used at the moment a question
closes. A closed question that is not written down is an open question.

### STILL TODO FROM THIS RETRO

- ~~`scan-secrets.mjs`: print the resolved repo path and remote before scanning
  (D4).~~ **Done** in the same commit as this entry — writing a TODO for a
  two-line fix would have been F4 all over again.
- `check-legacy-key.mjs`: accept owner-supplied evidence as a closing state, so
  it reports SETTLED rather than NOT MEASURED forever from a blocked surface
  (D1). Open — needs a small evidence file the script can read, not just a
  probe.

---

## 2026-08-13 — session 01KzQZ, part 3 (claude-opus-5, cloud) — building M1

### A8 — I shipped the house defect into the tool built to catch it

The TrustShell M1 parser's first working run reported **"87 records on the
active path, 5,421 off it."** Ninety-eight percent of a real session called
abandoned. The number was wrong, and worse, it was *confident* — a plain
integer in a census table, with nothing marking it as inferred.

The bug: I modelled the transcript as one tree and reconstructed "what the
session actually did" by walking `parentUuid` back from the final leaf. The
transcript is a **forest** — 10 chain roots, 7 of them records whose parent is
not in the file at all (compaction boundaries and session resumes), 85 branch
points, 95 leaves. A single root-to-leaf walk reaches at most 1,484 of 5,547
addressable records **by construction**. Everything else got labelled
abandoned because the walk could not reach it.

Two failures stacked, and the second is the one worth keeping:

1. I assumed a data shape instead of measuring it. Cheap, ordinary, caught in
   minutes.
2. **I answered a question that has no answer in the data.** Nothing in the
   transcript records which sibling won at a branch point. "Which records are
   live" is not merely unmeasured, it is *undecidable from this input* — and I
   emitted a precise-looking number for it anyway. That is A1–A7's shape exactly
   (a system reporting something it has not earned), reproduced inside the
   product whose stated purpose is catching it. §11 of `TRUSTSHELL-V1.md` even
   names this risk — "the harness confabulates" — which I had read that hour.

The fix was not a better heuristic. It was **deleting the field.** The census
now reports what the graph demonstrably is (roots, dangling parents, leaves,
branch points, longest chain) and reports no liveness verdict. Two assertions
in `check-transcript-parser.mjs` now fail if `activePathRecords`,
`abandonedRecords`, or `onActivePath` ever come back.

What caught it: **the number was implausible on its face.** Not a test — the
42 assertions all passed, because I had written them against my own wrong
model, on a fixture I had built to match it. A green suite over a wrong premise
is the four failures in `TRUSTSHELL-V1.md` §1 in miniature. What actually
caught it was running the thing against real data and *reading the output*
instead of the exit code.

**The generalisation, and the reason this is A8 rather than a footnote:** when
a field cannot be derived from the input, the correct output is not a best
guess, a heuristic, or a caveat in prose beneath a confident number. It is **no
field.** A missing field makes the next reader ask. A wrong field makes them
build on it.

### WHAT WENT RIGHT — the 2.36× overcount

The same run caught a real error in the spec, which is the outcome M6 predicts.
`TRUSTSHELL-V1.md` §4.2 claimed 2,111,919 output tokens for this session. That
was a **per-record** sum. Claude Code repeats one turn's `usage` verbatim on
every record of that turn, so the true figure is 1,389,855 across 1,507
`requestId` groups — the naive sum inflates by 2.36×. [VERIFIED — 1,507 groups
over 3,147 records; every group internally identical, zero groups differing.]

The parser now reports both, named differently, with the ratio. The lesson is
narrow and reusable: **when two plausible definitions of a metric differ by
more than rounding, one field name for them is a bug.** Anyone re-deriving the
number the other way has to be able to see why they disagree, or the receipt is
not checkable — which is the whole product.

### A9 — I declared identity broken after checking four of five registries

Building the agent-memory recall path, I reported as a headline finding that
**"all 34 distinct `agent_memory_nodes.agent_id` values resolve to no row in
`agents`, `trinity_agents`, `agent_kya_registry` or `conductor_state`"** —
memory has no owner, recall cannot be scoped, everything else waits on this. I
ranked it defect #1 of four, wrote a migration adding an `owner_agent_name`
column to fix it, published a live view encoding it (`v_memory_recall_readiness`,
changelog #117), put it in `SESSION_SUMMARY.md` as the highest-value unblock,
and put it in the PR body as the single thing most worth Sean's time.

It was wrong. The nodes are owned by **`repid_agents`** — a fifth registry I
never queried. **34 of 34 owner ids and 429 of 429 nodes resolve** against it,
cleanly, and always did. There was nothing to repair.

What made the error, precisely: I enumerated candidate registries **from my own
reading of the schema** — I grepped `information_schema` for tables that looked
like agent registries, found four, and treated "not in any of these four" as
"orphaned." I never asked the only source that actually knows: **the code that
writes the column.** One grep of the writer (`repid-engine
scripts/seed-squad-memories.ts`) names `repid_agents` in its second statement.

The tell I walked past: 34 orphans out of 34 is not a data-integrity failure
pattern. Real orphaning is partial — some rows migrate, some don't. A clean
100% miss almost always means you are holding the wrong key, not that every
key is broken. I read 34/34 as "totally broken" when it should have read
"totally wrong lookup."

Two related claims in the same work were **understated rather than wrong**, and
the fix was to strengthen the evidence, not retract:

- *"Never recalled"* rested on `access_count = 0`, a counter I had not shown
  anything increments — and in fact grep found it only in type definitions and
  SELECT lists, which nearly made me retract a true claim. `graph_rag_touch_node`
  does increment it and `retrieval-service.ts:91` does call it. The claim now
  rests on `access_count = 0` **and** `accessed_at = created_at` on all 429 rows
  — two columns written by different code paths.
- *"There is no read path"* was false. `GET /api/v1/agents/:id/recall` is built,
  deployed and public. It has simply never returned a row.

**The rule.** For any claim of the form "X references nothing," the authority is
the code that writes X, not an enumeration of tables that look like they might
be the target. Enumerating candidates yourself and finding none is evidence
about your enumeration, not about the data. Grep the writer first.

This is the same shape as A8 one milestone later: a precise, confident number
derived from a model I built myself and never checked against the system that
produces the data. A8 was caught by reading the output. A9 was caught only
because the user asked me to go grep the writer — which is to say, it was not
caught by me at all.

---

## 2026-08-14 — session 01Ke9Y (claude-opus-5, cloud) — building the E2E suite

### A10 — the security gate went green over exactly the state I ran it in

I added an E2E harness, ran `npm run check` (which begins with `check:secrets`),
got **exit 0**, committed, pushed. CI failed on the first step:

```
USABLE  opaque:sb_secret  scripts/e2e/run-e2e.mjs
```

The harness set `SUPABASE_SECRET_KEY` to a realistic-looking placeholder. The
scanner is right to flag a prefixed opaque key — it cannot know a literal is
fake. That part is my bug, and the fix is trivial: the stub never validates the
key, so it had no business looking like one.

**The part worth writing down is why the local run said clean.** `scan-secrets.mjs`
enumerated `git ls-files` and then read each file with `git show HEAD:<file>`. So
it scanned neither of the two states that actually exist before a commit:

1. **An untracked file** — not in `ls-files`, never scanned. Mine was untracked.
2. **An uncommitted edit to a tracked file** — `git show HEAD:<file>` returns the
   *committed* blob, so a key added and not yet committed scans clean.

This is a pre-commit check that could not see the working tree. It reported
success over a file it had never opened — the same shape as the skipped E2E step
scored as a pass (#414), the build green over undefined references, and the
credential check green with no credential. Three prior instances are already in
this file, and I walked into the fourth while building a suite whose entire
premise is that a gate must not go green without executing something.

Fixed: scan the working tree (`ls-files` + `--others --exclude-standard`, read
from disk, skip binary by NUL byte). Verified by reproducing both false-greens
against the new version — an untracked file with a key, and an uncommitted edit
to a tracked one — and confirming each is now reported.

Then the fixed scanner flagged **its own comment**, because I had written the
literal prefix into the prose explaining the fix. Also correct behaviour. The
comment now says so, since the next person to document this will hit it too.

**A permanent artifact, so nobody chases it.** That placeholder is now in git
history at `afbb28c0`, and `scan-secrets --history` reports it forever as
`USABLE opaque:sb_secret history:afbb28c0`. It is **not a credential** — it was
never a valid key, the E2E stub never validated it, and there is nothing to
rotate. It is a fake string that happens to match a real detection rule. Do not
add it to an allowlist either: an allowlist that hides one prefixed opaque key
hides the next real one. Leave it reported and leave this note pointing at it.

**The rule.** A check that reads from `HEAD` is not a pre-commit check, it is a
post-commit check running early. Before trusting any local gate, ask which bytes
it actually opened — and if the answer is "the committed ones," it cannot tell
you anything about the change you are about to make. The cheapest proof that a
detector works is to hand it the thing it is supposed to catch.

### What went right

The E2E suite was verified by **breaking the code**: reintroducing the four RepID
literals into `pay/route.ts` produced 3 FAILED, core 6/8, exit 1. An assertion
suite that has never been observed to fail is an untested assertion. That step
also caught a hollow test of my own — both dual-signature assertions were passing
while blocked at `kya_validation`, so the gate under test never ran.

---

## A11 — a vault gate resting on a boolean nobody can check (2026-08-14)

**[VERIFIED] via Supabase MCP this session.** Found while measuring whether
wiring `ControlProof` into the payment path would be a migration or greenfield.
It is greenfield, and the measurement is why.

`agent_kya_registry` has a `custodian_zkp_proof` column. It is **NULL in all 12
rows.** Meanwhile five agents — NEXUS, ORCH, SHOFET, SOPHIA, VERITAS — carry
`human_custody_verified = true`. Nothing backs it: no proof, and
`custodian_linked_at` is NULL on every one of them, so the link has no
provenance either. The column built to hold the evidence has never held any.

That boolean is not inert. Traced through the code:

```
agent_kya_registry.human_custody_verified
  -> KYAValidator.ts:26   humanCustodyVerified: data.human_custody_verified
  -> KYAValidator.ts:68   humanCustodyBound: profile.humanCustodyVerified
  -> ComplianceReceipt.ts:53 -> kya_compliance_receipts.human_custody_bound
  -> ZKPAttestation publicSignals
  -> VaultPermission.ts:48   if (vault.requires_human_custody && !profile.humanCustodyVerified)
```

`institution_config.require_human_custody_vault` is **true** across all three
rows, threshold 50,000 USDC. So a **vault access decision** is gated on a
self-asserted flag. `require_human_custody_payment` is false, which bounds the
blast radius — the payment path does not gate on it today — but the value still
reaches compliance receipts and the attestation's public signals, which is how
an internal assumption becomes an external claim.

Two more things the same query surfaced:

- **`custodian_tier = 'qualified_investor'` on 7 agents.** That is a regulatory
  characterisation, asserted with no evidence recorded anywhere in the row.
- **TORCH and W3C contradict themselves**: `custodian_link_active = true` with
  `custodian_spending_authority = 250000`, but `human_custody_verified = false`.
  Two fields describing one relationship disagree — the same shape as the
  `x402_settlements.status` vs `.is_simulated` split in A9. Whichever field a
  reader happens to consult decides the answer.

**The rule.** A column named `*_verified` records that someone wrote `true`. It
is evidence of an assertion, never of a verification, unless a companion column
holds the artefact that can be re-checked — and then the check must actually run.
Here the companion column exists and is empty, which is worse than not having
it: its presence implies a verification step that no code performs.

**Not fixed by flipping anything.** Setting those booleans to `false` would
break vault access for five agents on the strength of a finding, and setting
them `true` is what created the problem. The fix is a `ControlProof` in
`custodian_zkp_proof` that `VaultPermission` re-checks, so the gate depends on
something reopenable. That path is built (`lib/trustshell/identity/`) and not yet
wired — deliberately, because changing a live authorization gate is a
Sean-gated decision, not a sprint convenience.

---

## A12 — a witness field that nothing constrained, and a "canonical" encoding that was a concatenation (2026-08-14)

**[VERIFIED] — both found while writing assertions for
`reputation-transition.ts`, before either had shipped.**

Two bugs in one file, and neither was visible by reading it. Both were in code I
had written an hour earlier and described in its own header as correct.

**1. `frontier` was declared in the witness and constrained by nothing.** The
`TransitionStatement` type listed a `frontier: MembershipStep[]`, the contract
listed it under `privateWitness`, and the verifier never read it. A prover could
supply anything. It was left over from a balanced-tree design that a chain
replaced — the field survived the redesign because a type declaration does not
have to be used to compile.

Reading the file finds nothing: it looks like a field that is *for* something.
The generic form is now a test that mutates **every field the contract
declares** — public inputs and witness alike — and requires each mutation to
fail verification. A field nothing constrains is now a failing test, not a code
review that has to notice an absence.

**2. The event encoding joined its fields with the empty string.** The doc
comment above it said "canonically encoded field by field". It was a
concatenation, and concatenation collides: `{value: 1, observedAt: '2026…'}` and
`{value: 12, observedAt: '026…'}` produce the identical string. One commitment,
two reopenings, and "which event was committed" has two answers — in an
append-only history, permanently.

A separator only helps if the separator cannot appear in a field, so a field
containing U+001F is now **refused rather than escaped**. An escaping rule is a
second thing both lanes have to implement identically, which is a second place
to disagree.

**And the writing-it-down failure, again.** The separator landed in the source
as a raw control byte rather than as a six-character escape sequence — exactly
the mistake logged for `disclosure.ts` and `nonce-store.ts`, in a file whose
comment warns about it, three lines above the bug. It happened a second time in
the test file. Both were caught by a byte scan, not by reading, because a raw
control byte is invisible in every diff and every review. **Assume it happened;
scan the bytes.**

### Two mutants survived a suite that had just gone green

Nineteen mutations, seventeen killed. The survivors were the whole value of the
run:

- **A commutative node hash survived everything.** The multi-event order test
  compares chains whose *inner* roots already differ, so it stays sensitive even
  when a single append is order-blind. But `H(prev, event) == H(event, prev)`
  means "root R extended by event E" is indistinguishable from the reverse, and
  an attacker picks which value was the history. The property has to be asserted
  at the single-append level, where it is actually visible.

- **The borrowed-member attack needed a COMPOUND mutation to expose.** Deleting
  the appender's reopen check survived on its own; walking membership from the
  witness commitment survived on its own; together they let an outsider append
  using a genuine member's public commitment and path while nullifying with
  their own secret. Group leaves are public by construction — that is what makes
  a root shareable — so the secret is the only thing standing between an
  outsider and a write.

**The rule.** Single-mutation testing finds single points of failure. Two checks
that each make the other redundant are invisible to it, and "each one is
individually redundant" is exactly the argument that deletes both. When a
comment says a check is redundant *here* but load-bearing *in the circuit* —
which is now written in two files — mutate the pair, not the parts.
