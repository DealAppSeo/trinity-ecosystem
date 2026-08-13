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
