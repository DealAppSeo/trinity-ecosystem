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

**S1 UPDATE — CLOSED 2026-08-16.** Both tables now carry `{authenticated}`
policies rather than `{anon}`. Verified against `pg_policies`, not against a
migration file.

---

### SECURITY FINDINGS — 2026-08-16

**S3. 196 tables are world-readable, not two.**

`CLAUDE.md` said "two tables are currently `USING (true)` for `anon`", reading
S1 above as a statement about the database. S1 audited exactly two tables and
said nothing about the rest. Measured against `pg_policies` on 2026-08-16:

    198 policies over 196 distinct tables in `public`
    role anon or PUBLIC, cmd SELECT or ALL, qual literally `true`

Combined with the publishable key shipping in the browser bundle, every row and
column of all 196 is readable by anyone who views source — not merely the
aggregates a UI renders.

**Severity, measured rather than assumed.** The alarming name is the safe one:

| table | rows | what is exposed |
|---|---|---|
| `user_keys` (`grok_key_enc`, `claude_key_enc`, `chatgpt_key_enc`, `trinity_api_key`) | **0** | nothing today — a loaded gun with no round in it |
| `trustex_identities` | **5** | `proof_of_life_email` on all 5, plus phone, biometric and `wallet_address` |
| `trustchat_sessions` | **57** | `user_message`, `llm_response`, `user_ip_hash` |
| `waitlist` | **9** | signup rows |
| `customer_feedback`, `staking_deposits`, `staking_withdrawals` | 0 | nothing today |

So the live exposure is **~71 rows of real PII and user conversation content**,
not a credential leak. `user_keys` is empty and `trinity_api_key` — the one
column without an `_enc` suffix — has zero non-null values. That is the
difference between an incident and a hazard, and it is worth stating precisely
in both directions: nothing has leaked, and the policy that would leak it is
live right now.

**Values were never read.** This finding is built from `pg_policies`,
`pg_attribute` and `count(*)`. Column names and row counts establish severity
without pulling secrets into an agent transcript, which is the same class of
mistake as the key that started `docs/KEY-ROTATION.md`.

**The remediation is DROP, not add.** `service_role` has `rolbypassrls = true`,
so server-side callers keep working by bypassing RLS — adding a `service_role`
policy grants nothing. **NOT EXECUTED — destructive DDL is Sean-gated.** Ready
to run, highest severity first:

```sql
-- The rows that actually exist. Reads route through API routes holding the server key.
drop policy if exists "trustchat_sessions_anon_select" on public.trustchat_sessions;
drop policy if exists "trustex_identities_anon_select" on public.trustex_identities;
drop policy if exists "waitlist_read_all"              on public.waitlist;
-- Empty today, and the one that must never populate while readable.
drop policy if exists "Anon read user_keys"            on public.user_keys;
```

Then re-run the census and expect the count to fall by four:

```sql
select count(*) from pg_policies where schemaname='public'
  and (roles::text like '%anon%' or roles::text like '%public%')
  and cmd in ('SELECT','ALL') and coalesce(qual,'') in ('true','(true)');
```

**Why the other 192 are not in that block.** Most are agent telemetry and public
registry data where `anon` read may be intended. Dropping 196 policies blind
would break every client read at once and is the same failure shape as wiring an
unmeasured gate — the four above are the ones with rows, PII, or credential
columns. The rest need a per-table decision, not a sweep.

**The rule.** A security claim in ground truth is a measurement with a date, or
it is not a claim. This one was inherited, generalised, and then re-read as fact
for four days by every agent that opened `CLAUDE.md`.

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

## A12 — the whole dashboard died because two components agreed on a name (2026-08-14)

**Found by the browser, not by any gate.** `npm run check` was green, `tsc
--noEmit` clean, `next build` succeeded, CI green, both surfaces serving the
right commit. `/dashboard` was replaced end to end by "Something failed to
load", and none of the above could see it, because the throw happens in the
browser after hydration.

```
Error: cannot add `postgres_changes` callbacks for
       realtime:public:agent_kya_registry after `subscribe()`.
```

`SystemTrustScore` and `AgentRepIDGrid` both watch `agent_kya_registry`, and
both named their channel after the table: `.channel('public:agent_kya_registry')`.
A supabase-js channel topic is an **identity**, not a description. The second
component to mount bound `.on()` to a channel already past `subscribe()`,
supabase-js threw, the throw escaped the `useEffect`, and the error boundary
took the **entire page** — trust score, receipt feed, risk controls, all of it —
not just the component that made the mistake.

**Why it reads as correct.** `public:<table>` is the exact string the Supabase
realtime docs use in their examples, so both authors independently wrote the
idiomatic thing. The convention is only wrong at the second call site, and
nothing at the first one hints that a second exists. Fix: one topic per
subscriber (`system-trust:…`, `repid-grid:…`), not one per table.

**The blast radius is the real lesson.** An unhandled throw inside one
component's effect is not scoped to that component. Three healthy components
were dark because a fourth mis-named a string, and the page said nothing about
which one.

**What this cost, and what it did not.** It cost nothing to find once a browser
was pointed at a production build of the merged commit — it was the first thing
the browser said. It had been invisible to five green gates. That asymmetry is
the argument for `npm run setup:browser` existing at all: this class of defect
is only observable by rendering the page, and this repo had no way to render a
page until 2026-08-14.

**Two things the same pass surfaced, not fixed here:**

- `app/login/page.tsx:135–158` — the Email and Password `<label>`s carry no
  `htmlFor` and the inputs no `id`, so the accessibility tree shows two
  `textbox [required]` with **no accessible name**. Visually labelled,
  programmatically not. The a11y snapshot showed this without being asked.
- `SystemTrustScore.load()` does `setData(await res.json())` with no `res.ok`
  check. On a 500 the JSON parse throws and the component sits on "Loading trust
  score..." forever, reporting nothing. Production returns 200 so it is latent,
  but it is the house defect again: a failure that renders as a pending state.

---

## A13 — a witness field that nothing constrained, and a "canonical" encoding that was a concatenation (2026-08-14)

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

---

---

## A14 — an optional callback that is never absent, and a replay defence that recorded nothing (2026-08-14)

**[VERIFIED] — both found by tests while building `loop-authorizer.ts`, the
adapter binding the agent loop to `ControlProof`. Neither was visible by
reading.**

### 1. `valueOf` is on `Object.prototype`, so the option was never optional

The adapter took an optional callback for extracting the value an action moves,
so the `maxValue` caveat could be applied:

```ts
export interface ControlProofAuthorizerInput {
  valueOf?: (call: ToolCall) => { asset: string; amount: number } | undefined;
}
// ...
value: args.valueOf?.(request.call),
```

A caller who omits it gets `Object.prototype.valueOf` — **a function**, which
`?.` therefore calls, and which returns the container object. So `ctx.value`
became a truthy object with `asset: undefined`, `evaluateCaveats` skipped its
`if (!ctx.value)` NOT_CHECKED branch, and every call was refused with *"cap is
denominated in USDC but the action moves undefined"*.

The failure direction was safe here — it denied rather than allowed — but that
is luck, not design. The same shape with an allowlist-shaped default would have
failed open.

**The rule.** An optional property named after anything on `Object.prototype` is
never absent: `valueOf`, `toString`, `constructor`, `hasOwnProperty`,
`isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`. `?.` does not protect
you, because the property genuinely resolves — up the prototype chain. Rename
it. A `Object.hasOwn` guard also works and leaves the trap set for the next
person.

Worth noting what did NOT catch it: `strict` TypeScript compiled it without a
murmur, because the inherited member satisfies no type check that was being
made, and the *shape* of the failure — a denial — looked like ordinary
authorization behaviour.

### 2. `seenNonces` was read and never written, so replay defence prevented nothing

`verifyControlProof` says so in its own doc comment — *"Caller-managed spent
set. Single-process only; **the caller adds the nonce after a successful
verification**"* — and the adapter passed the set in, got `replay: VERIFIED`
back, and walked away without adding anything.

Every session therefore verified. A proof could be replayed into unlimited
concurrent sessions, and the check reported VERIFIED each time. This is the
`custodian_zkp_proof` shape from A11 exactly: a control that reads as enforced,
returns the outcome that means "enforced", and enforces nothing.

It was caught by an assertion on the *side effect* rather than the verdict —
`assert.equal(seen.size, 1)` — not by any assertion about what the verifier
returned. **When a check's correctness depends on the caller completing it,
assert on the state the caller was supposed to change.** A verdict of VERIFIED
is what the broken version produced.

The related mutation is worth recording because it survived the first pass: a
delegated chain has a nonce per link, and the replay check runs against the
ROOT. Recording the leaf's nonce is a no-op for a direct grant, where leaf and
root are the same object, so **only a delegation fixture separates them**. A
test that covers just the simple shape leaves the whole chain replayable.

### And the boundary, again

`>=` versus `>` at exactly `expiresAt` survived a test that checked one second
past expiry. `verifyControlProof` uses `now >= expiresAt`, so `>` would make the
two authorization paths disagree for exactly one millisecond. A one-instant
disagreement between two paths that both claim to enforce the same grant is only
ever found in production. **Test the instant, not a point safely past it** —
this is the third time that lesson has been paid for here, after the `maxValue`
cap and the rate limiter.

---

---

## A15 — an incremental build cache manufacturing compile errors that cannot exist (2026-08-14)

`npx tsc --noEmit` reported **4 errors** locally: a `Set<string>` iteration
wanting `--downlevelIteration`, and three BigInt literals wanting a target of
ES2020 or higher. On the strength of that count a CI gate was set to a baseline
of 4.

**All four were impossible.** `tsconfig.json` sets `"target": "es2022"`, which
supports BigInt literals and `Set` iteration outright. The contradiction was
sitting in the error text — the errors named the very constraint the config
already satisfied — and it was not noticed, because a count is easy to read and
an error message is easy to skim.

**Cause:** `"incremental": true` plus a stale `tsconfig.tsbuildinfo`. tsc replays
cached diagnostics for files it considers unchanged, and those four had not been
touched since an era when `target` was lower. `rm tsconfig.tsbuildinfo` and
re-run: **0 errors, twice.** CI, which checks out fresh and therefore has no
tsbuildinfo, had been reporting **0** the whole time.

**What made it visible was reading the CI log, not the CI result.** The run was
green either way — 0 passes a threshold of 4 — so the green tick carried no
information about the disagreement. Nothing would have surfaced it except
opening the log and comparing the printed count against the local one.

**The rule.** A build cache is part of the instrument, not part of the codebase.
When a local count and a CI count disagree, that is evidence about the local
machine first: CI's fresh checkout is the cleaner instrument, and the local one
has state CI does not. `CLAUDE.md` already warns that `tsconfig.tsbuildinfo` is
a build artefact, but only about `git stash` conflicts. It can also **invent
diagnostics**, and a wrong count published from it is indistinguishable from a
real regression.

**Generalises past tsc.** Any incremental or cached tool — `tsc --incremental`,
`next build`'s `.next/cache`, jest's `--cache`, a bundler's cache dir — can
report yesterday's answer about today's code with full confidence. The cheap
habit: before quoting a number from one, clear its cache once and confirm the
number does not move.

---

## A16 — the security tool whose recommended fix was a six-year downgrade (2026-08-15)

**Symptom.** `npm audit` reported 12 advisories (9 high, 3 moderate) and offered
the usual remedy: *"To address all issues (including breaking changes), run
`npm audit fix --force`."*

**What that command would actually have done**, read out of `npm audit --json`'s
`fixAvailable` field rather than out of the prose:

| package | installed | npm's "fix" |
|---|---|---|
| `@solana/web3.js` | 1.98.4 | **0.0.3** |
| `@solana/spl-token` | 0.4.15 | **0.1.8** |
| `agent0-sdk` | 1.7.1 | **1.5.3** |

All three installed versions were already the **latest published**. There was no
forward fix to take, so the resolver went backwards until it found a version with
no matching advisory — and versions old enough to predate the advisory database
satisfy that trivially. `@solana/web3.js` is on the live payment path via
`SolanaExecutor`; 0.0.3 predates the entire current API.

**The failure shape.** After `--force` the audit count would have read **0
vulnerabilities**, the number everyone checks, while the code got materially
worse. Nothing in CI would have caught it: no test asserts a version floor, and
the build would have failed later, somewhere unrelated, on a missing export.

This is the same defect the rest of this file is about — a system reporting
success it has not earned — arriving this time from a *security* tool, which is
the last place anyone thinks to distrust.

**The tell was in the metadata, not the summary.** `npm audit`'s human output
says "breaking change" and names the package. It does **not** say the change is
a downgrade. Only `fixAvailable.version` in the JSON shows the number, and only
comparing it against the installed version shows the direction. A one-line node
script over `npm audit --json` answered in seconds what the printed report
actively obscured.

**What was done instead.** Four different answers, because "fix the advisories"
is four different problems:

1. **A real fix existed** — `nanoid`, and `next`/`postcss` (21 CVEs) fixed only
   in `next >= 16.3.1`. Upgraded 14.2.35 → 16.3.1, migrated the config, measured.
2. **The dependency was not in the production surface** — `agent0-sdk` (and its
   `helia` → `@libp2p/kad-dht` chain) is reached only by one operator script.
   Moved to `devDependencies`, which is both accurate and drops it from the
   shipped tree. Production-only advisories: 12 → 6.
3. **No fix exists at any version** — `bigint-buffer`'s advisory covers `*`.
   Downgrading trades one known advisory for years of unfixed ones. Left, stated.
4. **The trap itself was made mechanical** — `scripts/check-deps.mjs` records a
   version floor per package with the reason, and fails the build if anything
   lands below it. Mutation-tested against the exact 0.0.3 downgrade.

**The rule.** *Read what a fix does, not what it is called.* Before running any
automated remediation, diff the proposed versions against the installed ones and
check the **direction**. An advisory count is a proxy; a proxy that can be
improved by making the code worse is not a measurement, and "0 vulnerabilities"
is a claim like any other — it needs the same three outcomes as everything else.

## A17 — one line that five pull requests had to fight over (2026-08-15)

**[VERIFIED] — five hand-resolutions of the same conflict in one night, across
four PRs, none of which needed a judgement.**

`npm run check` was a single ~400-character line naming every suite:

```
"check": "npm run check:secrets && npm run check:auth && … && npx tsc --noEmit"
```

Every lane that adds a suite must edit that line. Git resolves by line, and
there is only one, so **any two concurrent PRs adding suites collide by
construction.** Over 2026-08-14/15 that conflict was resolved by hand five
times, in PRs #28, #30, #31 and #33. Every resolution was "keep both". Nothing
about any of them required a person.

**The tell is the uniformity.** A conflict that always has the same answer is
not a disagreement between authors — it is a data-structure problem wearing a
merge conflict's clothes. One shared mutable line is a lock, and five lanes were
queuing on it.

**Fix:** `npm run check` is now `node scripts/check-all.mjs`, which DISCOVERS
`check:*` from `package.json`. Adding a suite means adding an independent
`"check:name": "…"` line, and two lanes adding two suites touch two different
lines and merge cleanly.

### What the discovery version can get wrong, and what stops it

A runner that finds its own work has a failure the hardcoded list did not:
**discover nothing, run nothing, exit 0** — the house defect, in the one place
that would mask every other suite at once.

- `MINIMUM_SUITES` is a floor, not a count. Below it the run FAILS as a
  discovery failure rather than passing over checks that never ran.
- An unparseable `package.json` exits 1. There is no "assume it is fine" path.
- Every discovered suite is printed before anything runs, and named in the
  summary with its outcome.
- `scripts/check-runner-test.mjs` asserts all of the above, and mutation testing
  killed 9 of 10 mutants against it. The survivor is documented in place: the
  null-status branch is unreachable because `npm run` converts a SIGKILLed child
  to exit **137** (measured), and 137 is covered.

### The thing the refactor found

Five suites — `harness-aggregate`, `harness-escalate`, `harness-reputation`,
`harness-timeout`, `harness-transform` — were **defined but absent from the
chain**, so CI had never run them. Discovery picked them up: **145 assertions
that had been written, committed, and never executed by any gate.** All five
pass. Nobody excluded them on purpose; they were simply forgotten at the point
where adding one meant editing the shared line.

That is the second cost of the one-line design, and the more expensive one: it
made the gate set easy to under-populate and impossible to audit at a glance.

### Three outcomes, taken from the exit code

The suites already encoded it and nothing read it: **0 = VERIFIED, 2 =
NOT_CHECKED, anything else = FAILED.** `check-legacy-key` exits 2 when the
network is denied, and four other scripts use the same signal. The old `&&`
chain collapsed 2 into failure, which is why that suite was kept out of the
chain — a correct check, excluded because the runner could not express its
answer. It now runs, and its NOT_CHECKED is reported rather than hidden or
promoted.

**The rule.** When the same merge conflict resolves the same way more than twice,
stop resolving it and change the shape that produces it. And when a runner
starts discovering its own work, the first thing to test is what it does having
discovered nothing.

---

## A18 — three commits with no gate, on a PR whose checks looked green (2026-08-15)

**[VERIFIED by observation; mechanism is documented GitHub behaviour, not
measured here.]**

Three consecutive pushes to PR #36 — `38d1544`, `0300ff9`, `666a0ba` — produced
**no `check` workflow run at all.** Not queued, not failed. No run existed. The
next push, `f69b654`, produced one **two seconds** after the push.

The difference between them: the first three landed while the PR had **merge
conflicts with `main`**; `f69b654` was the merge that resolved them.

**Why this is the house defect and not a CI curiosity.** The PR page did not
say "no checks ran". It showed the checks that *do* run on a conflicted PR —
Vercel's deployment status and its preview-comments check — both green. A
reviewer glancing at it sees a PR with passing checks. So did the author. Three
commits carrying an authorization port, a signing module and a verdict pipeline
sat with **`npm run check` never having executed against them in CI**, behind a
green tick that was describing something else entirely.

The local run was green, which is what made it comfortable. A local green and a
CI green are different facts, and this is exactly the gap the three-outcome rule
exists to keep open: the honest status of those three commits was NOT CHECKED,
and nothing on the page said so.

**The mechanism.** `pull_request`-triggered workflows run against
`refs/pull/N/merge` — the *merge* of head into base, not the head commit. GitHub
cannot construct that ref for a PR it cannot merge, so the event produces no
run. This is documented behaviour and it is not a bug; the defect is that
nothing surfaces it as an absence.

**What was NOT established.** PR #38 was also conflicted at the time of writing
and *does* show a passing `check` run — which looks like a counter-example and
is not one. That run is from 06:22 UTC, when `main` was still `3c70330`; the
conflict arrived with `b7c7177`/`849e181` at 07:04–07:32 UTC, and #38 has not
been pushed to since. There has been no event to suppress. So #38 neither
confirms nor refutes this, and it is recorded here as untested rather than as
supporting evidence.

**The rule.** *A conflicted PR is NOT CHECKED, whatever its checks say.*
Before reading a PR's status, confirm it is mergeable — `git merge-tree
--write-tree origin/main HEAD` answers it locally in one command, and
`grep -c CONFLICT` on that output does **not**, because SQL `ON CONFLICT` and
prose both match. Merge `main` in before trusting a green tick, and treat
"no run exists" as a distinct outcome from "the run passed".

## A19 — the documented rule that was enforced in one directory (2026-08-15)

**[VERIFIED by reproduction: the defect was introduced, caught by CI, fixed, and
the guard re-run against a deliberate reintroduction.]**

`work-contract.ts` has said it since it was written: *"Written as an escape,
never as a raw byte. A literal U+001F in source has landed here twice and both
times was caught by a byte scan rather than by reading — it is invisible in every
editor and survives review."*

It landed a **third** time, in `checker-assignment.ts`, written by the agent that
had read that warning **in the same session**. The separator was authored as an
escape and arrived on disk as the character itself.

**What caught it, and what did not.** `check:identity` caught it in CI and turned
the PR red — it already runs exactly this scan over `lib/trustshell/identity/`.
The guard worked. What did **not** catch it: the module's own 15 assertions, a
9-of-10 mutation run, `tsc --noEmit`, and reading the diff. The local signal was
an accident — a `grep` printed `const SEP = ` followed by two quotes with nothing
visible between them, and the empty-looking quotes were the only tell.

**The finding that mattered more than the fix.** The scan existed only for
`identity/`. Running the same scan repo-wide found the defect **still live
elsewhere**: two raw U+001F in the kernel (`loop.ts`, in the tool-call and
observation fingerprints) and **four raw NUL bytes in `agreement.ts`**, in the
pair key two agents compare.

Those four are not a new discovery. They are the incident `work-contract.ts`
already describes — *"four raw NUL bytes once sat in this repo's wire formats …
and the interop spec handed to the other lane was wrong because of it"* — sitting
untouched, in live wire-format code, believed fixed for months. **The rule was
documented, the incident was written up, and the enforcement covered one
directory out of the tree.**

All eleven are now escapes. Behaviour is identical, because the escape and the
character compile to the same string; six suites stayed green across the change,
which is what makes it a source-representation edit rather than a wire-format
one.

**The rule.** *A rule that has been violated three times is not a rule, it is a
wish — and a guard that covers one directory does not cover the repository.*
When an incident is worth writing into a header, it is worth a `check:` script
with the scope of the hazard rather than the scope of the file it was found in.
`npm run check:raw-bytes` now scans every `.ts`, `.tsx`, `.mjs`, `.js` and `.sql`
under `lib/`, `scripts/`, `app/` and `supabase/`.

**How this entry was nearly written wrong, twice.** The first draft of the guard
claimed *"nothing caught it"*, which was false — `check:identity` did, in CI.
And the shell refused the command that would have appended this very lesson,
because the text quoting the hazard contained the hazard. Both are the same
shape as the defect itself: a claim about bytes, made without looking at them.

**A second-order note, from the same night.** Two mutation readings during this
work were artifacts rather than evidence — one scored an unregistered npm
script's "missing script" exit as a killed mutant, and one reported a survivor
whose mutation never applied because bash had mangled the anchor. Both looked
exactly like the result being sought. **A non-zero exit is not automatically the
failure you were looking for**, and a mutation harness must prove the mutation
landed before it reports on what the mutation did.

## A20 — two correct components, one value, two meanings (2026-08-15)

`bft-judge.ts` and `staged-judge.ts` were built in separate lanes. Both were
unit-tested, both mutation-tested, both correct. Their composition was wrong, and
neither suite could see it.

The shared value is `Outcome.NOT_CHECKED`, and each lane gave it a meaning:

- `bft-judge` returns it for a fired Pythagorean veto, meaning **"the panel's
  unanimity is itself the warning sign — a HUMAN must look"**.
- `staged-judge` reads it as **"this tier could not decide — ASK THE NEXT
  TIER"**.

Both readings are defensible in isolation. Composed, the second silently consumes
the first: measured on the first run, a vetoing panel placed anywhere but **last**
had its referral escalated to a single model, which said VERIFIED. Every unit test
stayed green. Every signature in the chain verified. The verdict was wrong and
nothing in the system said so.

**It was worse than losing a signal — it inverted one.** The panel's entire claim
is that *more model agreement is the problem here*. The staged judge's repair was
to ask one more model. The remedy was the disease.

**Why no unit suite could have caught it.** Each unit is self-consistent under its
own reading. A suite written from inside one lane asserts that lane's meaning and
passes. **The bug lives in the gap between two vocabularies, and a gap has no
owner** — the same shape as `repid_score_events.event_type` versus
`ReputationSignal`, and the same shape as the two Vercel projects named after
domains they do not serve. This repo keeps producing it.

**The rule.** *When two components exchange a value from a small enumeration,
write a suite that belongs to neither and run it before trusting the composition.*
The question it must ask is not "does each side handle every case" — both did —
but **"does each side mean the same thing by each case".**

**The fix that was rejected, and why it matters more than the one built.** The
zero-code option was to document the ordering constraint: *put the panel last*.
That is not a fix. It leaves a **config file** standing between a vetoed run and
a false pass, and tier order is data — a correctness property that holds for one
ordering is not a property. The built fix makes the judge state which
`NOT_CHECKED` it meant (`referToHuman`), so position stops mattering; one
assertion now pins the whole thing, checking that a vetoing panel yields the same
outcome at every position.

**And the part that is easy to get wrong in the other direction.** Not every
`NOT_CHECKED` is a referral. `bft-judge`'s truncated-evidence case is genuinely
resolvable by a judge with a bigger window, so it deliberately does **not** set
the flag, and an outage is recorded as `referredToHuman: false` — counting
provider downtime as human referrals would bury the referral rate in
infrastructure noise. **A signal that fires for everything measures nothing.**
Both omissions are asserted, not assumed: `check:panel-tier` fails if truncation
or an outage ever claims a referral.

---

## A19 — `npm run check` was 52 VERIFIED, and CI still went red (2026-08-16)

**[VERIFIED] — the run is in CI: `check` green, `test:e2e` red, same commit.**

`npm run check` — the repo's own comprehensive gate, the one `check-all.mjs`
discovers 52 suites for — reported **52 VERIFIED, 0 NOT_CHECKED, 0 FAILED**.
The same commit failed CI.

The workflow runs three things, and `check` is only the first:

```
npm run check        # 52 suites  <- the one everybody runs
npx next build
npm run test:e2e     # 37 steps over HTTP against a real server
```

The failure was a **denial reason reworded**. `checkPerTxLimit` said "exceeds
the per-transaction limit of 100" where the original said "exceeds per-tx limit
100", and `scripts/e2e/run-e2e.mjs:356` matches `/exceeds per-tx limit/i`
against it **over HTTP**. Nothing in the 52 suites touches that string, because
none of them starts a server.

**Why it is the house defect and not a slip.** The reworded string is a
`denialReason` written into a compliance receipt — an artifact whose entire
purpose is being evidence. Its wording is an observable contract, and it was
edited as though it were prose, in a commit whose subject was *fixing* unearned
claims. Confidence came from a green run that structurally could not see the
break.

**The rule.** *Before claiming a change is green, run what CI runs — all of it.*
`npm run check && npx next build && npm run test:e2e`. A suite that does not
start a server cannot see an HTTP contract, and `check-all.mjs`'s summary line
is honest about what it ran, not about what CI will.

Also, from the same incident: the fast suite now duplicates the e2e's own
regexes (`check:repid-scoring`, 'THE DENIAL WORDING IS A CONTRACT'), so the next
break shows up in seconds rather than after a build and a server boot.

---

## A20 — a CI poll that 403s looks exactly like a CI run that has not finished (2026-08-16)

**[VERIFIED] — `curl` to the REST endpoint returns 403; the MCP tool returns the
same runs successfully, seconds apart.**

An agent session watching its own PR wrote the obvious poll:

```bash
until out=$(curl -s ".../commits/$SHA/check-runs" | python3 -c "
  d=json.load(sys.stdin)
  runs=[r for r in d.get('check_runs',[]) if ...]
  if runs and all(completed): print(...)"); [ -n "$out" ]; do sleep 30; done
```

It never fired. Not once, across four PRs and a whole night.

```
$ curl -s -w '%{http_code}' .../check-runs
403 {"message": "Resource not accessible by integration"}
```

**The session's GitHub token cannot read `/check-runs` over REST.** The MCP
tool (`pull_request_read` with `method: get_check_runs`) reads the same data
fine — different auth path. So the capability exists; only that route is closed.

**Why it survived a whole night undetected.** `d.get('check_runs', [])` turns a
403 body into an empty list. Empty list → no completed runs → print nothing →
the `until` loop treats it as "not finished yet" and sleeps. **A poll with two
states — fired / not yet — silently absorbs a third: cannot look.** Which is
this repository's founding defect, committed inside the tooling built to verify
this repository.

The tell was available and ignored: the watchers ran to their full timeout
*every time*, and CI results only ever arrived via webhook wake events. A poll
that has never once fired is not a slow poll.

**The rules.**

1. **Read CI status through the MCP tool, not `curl`.** REST `/check-runs` is
   403 from a session.
2. **A poll loop must distinguish "not ready" from "could not read".** Check the
   HTTP status; a non-200 is NOT_CHECKED and must be surfaced, never slept on.
   `.get(key, [])` on an unparsed error body is the exact line that hides it.
3. **A watcher that has never fired is evidence about the watcher.** Silence
   from a check is not a result.

---

## A21 — a detector scored as anti-predictive because two modes use different scales (2026-08-16)

**[VERIFIED] — pooled AUC 0.4493 [0.4075, 0.4911]; the same score on the only
stratum where the comparison is defined gives 0.9579 [0.9375, 0.9784]. Full
measurement and reproduction SQL in `docs/HAL-AUC-STRATIFICATION-2026-08-16.md`.**

HAL detection accuracy was being computed over "1,825 labelled rows" and coming
out at roughly 0.46 — *below* chance, which says a detector is reliably
**anti**-predictive. Caught before publication.

Two properties of `hal_runner_results` explain the whole thing:

- **All 197 labelled hallucinations live in one `hal_mode`** (`fact-check-s2`).
  The other two modes contribute 1,163 negatives and zero positives.
- **`mock` mode writes `hal_score` on a 0–100 scale** — minimum 50.055, median
  70.503 — while `real` and `fact-check-s2` write 0–1.

AUC is the probability a random positive outranks a random negative. Pool those
and 653 mock negatives outrank **every** positive before HAL's behaviour is
consulted. The pooled statistic answers *"do mock rows score higher than
fact-check rows?"* — yes, by definition of the scale.

**The near-miss is the point.** 0.46 is not an absurd number. It is close enough
to 0.5 to read as "the detector is weak", which is a publishable-sounding,
narratively satisfying, completely wrong conclusion — and the real answer is the
opposite of it. The detector is strong.

**The second tell, available without any stratification.** The pooled figure
crosses the chance line depending on which defensible filter is applied: nulls
scored as 0 gives 0.5206, scored-rows-only 0.4839, scored-and-generation-
succeeded 0.4493. Only the last separates from 0.5, and it is the cleanest-
looking of the three. *A quantity whose sign depends on which reasonable filter
you pick is not yet a measurement*, and that was visible before anyone looked at
`hal_mode`.

**The rules.**

1. **Before pooling a score across groups, check that the score means the same
   thing in each.** One `select min, median, max ... group by mode` would have
   ended this. Different units in one column is not exotic; it is what happens
   when a mock path and a real path are written months apart.
2. **A stratum with zero positives cannot inform a ranking metric — it can only
   dilute it.** Check class support per group before pooling, not after the
   number looks wrong.
3. **Below-chance AUC is a sample bug until proven otherwise.** A genuinely
   inverted detector is rare; an incomparable sample is common. Treat it as a
   shape question first.
4. **Average ranks within ties.** `hal_score` has 730 distinct values over 1,710
   rows, so ties are dense. Naive tie-breaking on a near-constant score produces
   an AUC just below 0.5 on its own — a second independent route to the same
   wrong conclusion, and one that would have survived fixing the scale problem.

This is the fourth instance of the failure class the prior-work index already
names — *suspect the sample before the measurement* — and the third caused
specifically by an unexamined assumption about the **shape** of the data rather
than its values.

**Follow-up, same session: A21 left one sub-stratum NOT EXPLAINED, and the
explanation turned out to be A22 below.** The residual was not noise and not
benchmark difficulty. Chasing an unexplained caveat rather than shipping around
it is what found it.

---

---

## A22 — the credential scanner could not see binary files, and the speed fix is what found it (2026-08-16)

**This started as a performance sprint and ended as a security one.** Both halves
matter, and the order matters more.

**The measurement.** `npm run check` takes 171.7s locally across 58 suites, and
one suite was **29.7s of it — 17%**. `check:legacy-key`, the gate that hunts
legacy Supabase JWTs in git history.

**The first hypothesis was wrong, and cheap to disprove.** The suite ends in
`NOT MEASURED` because the sandbox proxy denies `*.supabase.co`, so the obvious
reading was five probes each burning a 15s timeout. A patch was written to
short-circuit them. It saved nothing — the probes were never slow. Timed
directly: **390ms, 10ms, 4ms**. The proxy answers 403 immediately; the fetch
resolves, so the timeout path never runs.

The cost was `collectLegacyJwts`: **one `git grep` subprocess per commit, 710
commits**, each re-reading every file in that commit's tree. A file unchanged
for 700 commits was scanned 700 times.

**The fix, and the surprise.** Scanning **unique blobs** instead — 5,553 of them,
each read once — took **0.97s**. But it returned **six** tokens where the
per-commit scan returned **five**.

A difference is not a win until it is explained. The extra token lives in
`trinity-science/app/__pycache__/anfis_router.cpython-313.pyc`, a committed
compiled-Python file. **`git grep` skips binary files by default.**

**That is the finding.** The scanner had a blind spot the width of an entire file
class, and it reported clean about a place it never looked. This particular token
is `role=anon`, and every legacy key on this project is disabled, so it is inert
— exactly like the `service_role` JWT in `docs/KEY-ROTATION.md`. The severity is
not this key. It is that a `service_role` token committed inside **any** binary —
a `.pyc`, a build artifact, a bundled archive, a compiled test fixture — would
have been equally invisible, and the gate would have gone green.

**Result: 28.9s → 1.3s, and 5 keys → 6.** Faster and more complete, which is
usually a sign the old thing was doing unnecessary work rather than careful work.

**Mutation tested** by capping blob reads at zero bytes (finds nothing, proving
it reads blobs rather than inferring) and by breaking the size-based frame
parsing (result changes rather than silently degrading).

**HANDOFF — `scan-secrets.mjs` has the same blind spot.** It scans history with
`git grep` in 64-commit batches, so it inherits the binary skip. It was not
changed here: it is the supply lane's file, its history mode is deliberately
non-failing, and one gate at a time is the whole point of one-advisory-per-change.
Its working-tree mode is unaffected.

**Two rules.**

*Measure where the time is before optimising it.* The plausible story — five
network timeouts — was wrong, and a patch had already been written against it.
One `Date.now()` around a `fetch` cost three seconds and saved a wrong change.

*When a faster implementation returns a different answer, the difference is the
result.* The instinct is to reconcile it away as a bug in the new code. Here the
new code was right and the old gate had been under-reporting for as long as it
had existed.

---

## A23 — 41 vetoes fired on rows where the detector called no provider (2026-08-16)

**[VERIFIED] — 59 rows in `hal_runner_results` have an EMPTY `hal_providers_used`,
carry a `hal_score` anyway, and 41 of them have `hal_vetoed = true`. Measured
2026-08-16; detail in `docs/HAL-AUC-STRATIFICATION-2026-08-16.md` §5.**

A21 closed with an honest loose end: within the valid stratum, `hal_test_cases`
scored AUC 0.5940 against `t12-overnight`'s 0.9757, and the document said so and
called it NOT EXPLAINED. Investigating that caveat found the real defect.

It was never about the benchmarks. Same `gen_provider`, same `gen_model`, same
`hal_threshold`. **In 59 of 71 `hal_test_cases` rows, HAL called no verification
provider at all** — and still wrote a score. Split the stratum on execution
rather than on benchmark:

```
HAL ran (>=1 provider)     n=169/167   AUC 0.9746  [0.9574, 0.9917]
HAL did NOT run (empty)    n=28/31     AUC 0.5150  [0.3662, 0.6637]
```

`benchmark_source` was a proxy. The real variable is whether the detector
executed. The no-provider rows sit at chance because **the score cannot depend on
evidence that was never gathered** — class medians 0.2567 and 0.2781, a
separation of 0.0074.

**The metric contamination is the lesser half.** 41 of those rows set
`hal_vetoed`. HAL emitted an actionable verdict — a veto — having consulted
nothing. That is this repository's founding defect, *a system reporting a result
it has not earned*, sitting inside the component built to catch exactly that, and
it was invisible because the row looks complete: it has a score, a latency, a
veto flag, and a label.

Latency was the tell, available the whole time: **947 ms mean against ~3,100 ms**
when a provider is actually called. A third of the work, a full-looking row.

**The rules.**

1. **"Produced a number" is not "ran".** Before a row enters any denominator,
   check the column that records whether the work happened — provider list, call
   count, cost. A NULL result is loud; a **default** result is silent, and a
   default that looks plausible is the worst case.
2. **A verdict must not outlive its evidence.** If the provider list is empty,
   the correct output is NOT_CHECKED — not a score, and certainly not a veto.
   Three outcomes, at the point of writing, not only at the point of reading.
3. **Chase the caveat you wrote down.** A21's own NOT EXPLAINED line was the
   thread that led here. Two of this repo's retractions were caught by caveats
   their authors had written and then ignored; this is the first one caught by a
   caveat somebody actually pulled.
4. **Non-empty is not valid.** 12 rows carry the literal string `used:2` in
   `hal_providers_used` where names belong. A count written into a name field
   means an "is it non-empty" check can still pass on garbage. Still OPEN.

### The same rows read as a feature by a second lane

The sharpest part of this arrived from outside. Working independently, the
grok-code lane (PR #55) measured the same corpus, found the same three-mode
trap, computed the same AUC 0.9579, caught the same tie-handling error — and
built the better artefact, a `PooledModes` refusal in code where this lane had
only written a recommendation. It also recorded:

> *"HAL's veto is not a threshold: 41 rows vetoed below 0.43, zero above it
> escaping."*

**Those 41 are exactly the no-provider rows** — the partition is exact, 41 of 41
sub-threshold vetoes from empty-provider rows, 0 from rows where a provider ran.
Read from the veto side it looks like a bonus detection path lifting recall from
0.807 to 0.904. Read from the provider side it is 41 vetoes cast with nothing
consulted: 19 landed on hallucinations (67.9% of that group's positives), 22 on
clean answers (71.0% of its negatives). **It fires slightly more often on the
clean ones.**

**The lesson is not that the other lane was careless — it was not.** It is that
the *same rows* support a capability reading and a defect reading, and the column
that separates them (`hal_providers_used`) is in neither the metric nor the veto
flag. Two competent measurements of the same table disagreed about what HAL
*does*, and only joining on execution resolved it.

Corollary for this lane: when a second measurement of your subject exists, **read
it before publishing yours.** The cross-check cost one query and changed a
headline; not doing it would have left two documents on `main` describing the
same 41 rows in opposite terms.
