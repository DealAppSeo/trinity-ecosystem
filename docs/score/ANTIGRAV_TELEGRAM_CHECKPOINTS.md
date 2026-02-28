# ANTIGRAV OPERATING PROTOCOL
**Addendum to ANTIGRAV_MISSION_BRIEF.md**
**Implement before Phase 1**

---

## CORE PRINCIPLE

**Autonomous by default. Checkpoint on risk.**

Work continuously. Don't stop for permission on things that are safe or reversible.
Only pause when an action is genuinely irreversible or could break production.

The goal: Sean gives an assignment, Antigrav works until it's done,
Sean gets a clean summary — not 20 approval requests.

---

## THE THREE TIERS

### TIER 1 — JUST DO IT
*No Telegram. No pause. Log it and keep moving.*

- Reading any files, logs, or repos
- Running read-only Supabase queries
- Running audits and generating reports
- Installing npm/pip packages
- Writing brand new files that don't exist yet
- Creating new DB tables (additive only)
- Adding new columns to existing tables (additive only)
- Writing to low-risk tables: `waitlist_signups`, `trinity_coaching_logs`, `antigrav_missions`
- Running tests
- Generating or updating documentation
- Any action that can be fully undone in under 60 seconds

### TIER 2 — DO IT, THEN TELL ME
*Do the work. Send one Telegram summary after. No approval needed.*

Card format:
```
✅ ANTIGRAV — [action done]
[1 sentence: what was done and why]
[Key result or output]
/rollback — undo this if needed
```

Triggers:
- GitHub commit and push
- Vercel deployment
- New API route created
- New Supabase table or function created
- New environment variable ADDED (not changed)
- New agent task seeded
- Phase completed

### TIER 3 — ASK FIRST
*Send card, wait for /approve before proceeding.*
*These are the only true blockers.*

Card format:
```
⚠️ ANTIGRAV — APPROVAL NEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[What I'm about to do]
[Why I need to do it]
[What happens if I don't]
[What happens if I do it wrong]

/approve  — do it
/skip     — skip this, move on
/redirect [instruction] — do something different
```

Triggers (the complete list — everything else is Tier 1 or 2):
- Modifying or deleting EXISTING data in Supabase
- Changing or deleting an EXISTING environment variable
- Restarting or redeploying a Railway agent service
- Modifying existing agent code in ConstitutionalAgentV4.js or shared library
- Any action touching ERC-8004, ZKP, or on-chain features
- Changing existing DNS records
- Anything estimated to cost real money
- Anything where Antigrav's confidence is below 70%

---

## BATCHING RULE

If multiple Tier 3 approvals are needed in sequence,
batch them into ONE card rather than sending them one at a time.

```
⚠️ ANTIGRAV — 3 APPROVALS NEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Update ANFIS_ACCURACY_CLAIM in index.html: "71-85%" → "68%+"
   (audit shows actual is 68.3%)

2. Restart trinity-veritas on Railway
   (unresponsive 40min, SURVIVOR loop active)

3. Change OPENROUTER_API_KEY env var
   (current key returning 401s)

/approve_all  — approve all three
/approve_1    — item 1 only
/approve_2    — item 2 only
/approve_3    — item 3 only
/skip_all     — skip all, flag for later
/pause        — hold everything
```

---

## PROGRESS LOG — NOT TELEGRAM

All Tier 1 and 2 actions are logged to Supabase `antigrav_missions` in real time.
Sean can pull the log anytime with /status but is never pushed unsolicited
updates for Tier 1 work. The log is the paper trail, not Telegram.

---

## STALL DETECTION

If no logged action for 25 minutes during an active mission, send ONE card:

```
💓 ANTIGRAV — STILL WORKING
Current task: [task]
Last action: [what was done]
Next: [what's coming]

/continue — acknowledged, keep going
/status   — send full log
/pause    — pause mission
```

If no response in 15 minutes, pause and log checkpoint.
Only one heartbeat per stall — no repeat pinging.

---

## PHASE SUMMARY CARDS

One card per phase. This is the main communication rhythm.

```
🎼 ANTIGRAV — PHASE [N] COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done:    [bullet list]
📊 Numbers: [real metrics]
⚠️ Flags:   [discrepancies, deferred items]
🔜 Next:    [Phase N+1 plan, est. time]

/approve  — start Phase [N+1] now
/pause    — hold
/redirect — change direction
```

---

## WAKE COMMANDS

| Command | Action |
|---|---|
| `/status` | Last 10 actions + current task |
| `/resume` | Resume from last checkpoint |
| `/pause` | Pause after current task |
| `/approve` | Approve pending Tier 3 decision |
| `/skip` | Skip blocked item, continue |
| `/rollback` | Revert last GitHub commit |
| `/agents` | Status of all 12 agents |
| `/wake [agent]` | Re-trigger stalled agent |
| `/savings` | Today's actual savings from Supabase |
| `/audit` | Current feature audit report |

---

## MISSION START

When ready to begin, send:

```
🎼 ANTIGRAV — READY
Mission: Landing page + audit + build queue
Mode: Autonomous (Tier 3 only)
Est. Tier 3 checkpoints: ~4-6 this mission

Starting Phase 1 in 60 seconds.
Send /pause to hold.
```

Silence = go. No approval needed to start.

---

## WHAT THIS LOOKS LIKE FROM SEAN'S PHONE

- Give Antigrav the assignment
- Get one "ready" card — ignore it if busy, it starts in 60s
- Get phase summary cards every 30–60 min
- Get Tier 3 cards only when something risky comes up (~4–6 total)
- Get a final mission complete summary with real numbers

Everything else runs autonomously with a full audit trail in Supabase.
