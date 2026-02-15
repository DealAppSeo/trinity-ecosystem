# 🤖 AGENT DIRECTIVES: Copy-Paste Commands

> **These are the exact prompts you give agents. Copy, paste, go.**

---

# ☀️ MORNING STARTUP DIRECTIVES

## For Claude (Web/Code)

### Morning Context Load
```
Good morning. Please:

1. Fetch and read: https://raw.githubusercontent.com/[ORG]/trinity-ecosystem/main/AI_CONTEXT.md

2. Check GitHub Issues: https://github.com/[ORG]/trinity-ecosystem/issues
   - Filter by: `author:claude` OR `verifier:claude`
   - Note any with `blocked` label

3. Report:
   - Current sprint status
   - Tasks assigned to you
   - Any blockers needing my decision
   - Verification requests waiting for you
```

### Morning Unblock Request
```
I have a blocked issue that needs your help:

Issue: [PASTE URL]
Agent stuck: [Gemini/Grok]
Problem: [ONE LINE DESCRIPTION]

Please:
1. Analyze the blocker
2. Recommend a solution
3. Draft a comment I can post to unblock them
```

---

## For Gemini (Antigravity)

### Morning Startup
```
Good morning. Starting daily operations.

1. Pull latest from main branch
2. Read AI_CONTEXT.md for current state
3. Check GitHub Issues assigned to you (author:gemini)
4. Report what's queued and any blockers

Then begin executing tasks in priority order.
After each task:
- Commit with descriptive message
- Update task status in issue
- Create Verification Request if task complete
```

### Resume After Break
```
Resuming operations.

1. Pull latest (another agent may have pushed)
2. Check AI_CONTEXT.md Session Log for updates
3. Check if any of your Verification Requests were reviewed
4. Continue with next priority task
```

---

## For Grok

### Morning Context
```
Good morning. Please review:

1. AI_CONTEXT.md: [PASTE RAW GITHUB URL]
2. Any issues labeled `verifier:grok`: [PASTE ISSUES URL]

Tell me:
- What needs your verification today?
- Any Web3/EIP-8004 questions from other agents?
- Blockers you can help resolve?
```

### Verification Assignment
```
Please verify this work:

Issue: [PASTE URL]
Author: [Claude/Gemini]
What was built: [BRIEF DESCRIPTION]

Verification requirements:
1. Use DIFFERENT sources than the author used
2. Check against EIP-8004 spec if applicable
3. Report: APPROVED / CHANGES REQUESTED
4. Post your findings to the GitHub issue
```

---

# 📱 DAYTIME QUICK COMMANDS (Mobile-Friendly)

## Quick Status Check (Any Agent)
```
Quick status. What's:
- In progress?
- Blocked?
- Done and waiting for verification?
```

## Quick Unblock (Any Agent)
```
Unblock needed:
Issue: [URL]
Problem: [ONE LINE]
What's the fastest path forward?
```

## Quick Approval (Any Agent)
```
Review this verification request: [URL]
Quick check - approve or flag issues?
```

---

# 🌙 EVENING SHUTDOWN DIRECTIVES

## For Gemini (Antigravity) - Primary Overnight Agent

### Evening Handoff (CRITICAL - USE THIS EXACT PROMPT)
```
EVENING HANDOFF - AUTONOMOUS OVERNIGHT OPERATION

I'm going offline until tomorrow morning.

STEP 1: SYNC
- Pull latest from main
- Read AI_CONTEXT.md completely
- Check all GitHub Issues assigned to you

STEP 2: TONIGHT'S PRIORITY TASKS (in order)
1. [TASK 1 - paste issue URL or description]
2. [TASK 2]
3. [TASK 3]

STEP 3: OPERATING RULES FOR TONIGHT
- Execute tasks in the order listed above
- Commit after completing each task (not during)
- Commit message format: "[TASK] Brief description"
- Create Verification Request issue when task done
- If blocked for more than 15 minutes:
  * Create GitHub Issue with `blocked` label
  * Include: what you tried, what failed, specific question
  * Move to next task
  * DO NOT SPIN ON BLOCKED TASKS

STEP 4: BOUNDARIES (DO NOT CROSS)
- DO NOT make architectural decisions
- DO NOT delete or significantly refactor existing code
- DO NOT assume database schemas - query first
- DO NOT create new dependencies without flagging
- DO NOT merge PRs - only create them
- If uncertain, create issue and move on

STEP 5: BEFORE YOU STOP
- Update AI_CONTEXT.md Session Log with:
  * What you completed
  * What's in progress
  * What's blocked
  * Any decisions needed from me
- Commit and push AI_CONTEXT.md
- Create summary issue: "Overnight Report [DATE]"

BEGIN AUTONOMOUS OPERATION.
I'll review your progress in the morning.
```

### Overnight Task Template (Create Issues Like This)
```
## Overnight Task: [CLEAR NAME]

**Priority:** [1/2/3] of tonight's tasks
**Agent:** author:gemini
**Verifier:** verifier:claude (morning)

### What To Build
[SPECIFIC DESCRIPTION - be very detailed]

### Files Involved
- `/path/to/file1.ts` - [what to do]
- `/path/to/file2.py` - [what to do]

### Acceptance Criteria
- [ ] [SPECIFIC TESTABLE THING 1]
- [ ] [SPECIFIC TESTABLE THING 2]
- [ ] [SPECIFIC TESTABLE THING 3]

### Example Output
[If applicable, show what "done" looks like]

### If Blocked
1. Spend max 15 min trying to resolve
2. Create issue with `blocked` label
3. Include: attempted approaches, specific error, what you need
4. Move to next task

### References
- Similar completed task: #[issue number]
- Relevant docs: [links]
```

---

## For Claude - Evening Summary Request

```
End of day summary needed.

Please review:
1. AI_CONTEXT.md current state
2. Today's closed GitHub issues
3. Current open issues

Generate:
1. "What shipped today" summary (2-3 bullets)
2. "Overnight priorities" recommendation
3. "Decisions needed tomorrow" list
4. Any concerns about current trajectory

This will go in my evening ritual notes.
```

---

## For Grok - Evening Verification Queue

```
End of day - verification check.

Review any pending Verification Requests where you're assigned:
[PASTE ISSUES URL filtered by verifier:grok]

For each one:
1. Can you verify now? Do it.
2. Need more info? Comment on issue.
3. Blocked on something? Flag for morning.

Goal: Clear the verification queue so agents can continue overnight.
```

---

# 🔄 SYNC COMMANDS

## Force Full Sync (When Context May Be Stale)
```
FULL CONTEXT SYNC REQUIRED.

Please:
1. Fetch LATEST AI_CONTEXT.md (ignore any cached version)
2. Check GitHub for most recent commits
3. Check all open issues
4. Report any discrepancies between AI_CONTEXT.md and actual state
5. If discrepancies found, tell me - don't auto-fix

This is a sync check, not execution. Just report current state.
```

## After Your Own Code Changes
```
I just pushed changes directly. Please:
1. Pull latest
2. Review my commits: [COMMIT HASH or "last 3 commits"]
3. Update AI_CONTEXT.md if my changes affect sprint status
4. Continue with your assigned tasks
```

---

# 🚨 EMERGENCY COMMANDS

## Stop All Work
```
STOP.

Do not continue current task.
Do not commit anything.
Do not create any issues.

Tell me:
1. Exactly what you were doing
2. What files you modified (uncommitted)
3. What you were about to do next

Wait for my instructions.
```

## Rollback Request
```
ROLLBACK NEEDED.

Revert the last [N] commits on [BRANCH].
Command: git revert HEAD~[N]..HEAD

Before executing:
1. Show me what will be reverted
2. Confirm this won't break other work
3. Wait for my "PROCEED" before executing
```

## Context Reset
```
CONTEXT RESET.

Something is wrong. Let's restart clean.

1. Discard any uncommitted changes: git checkout .
2. Pull fresh from main: git pull origin main
3. Read AI_CONTEXT.md from scratch
4. Report current state as if starting fresh
5. Do NOT reference anything from before this message

What is the current state of the project?
```

---

# 📊 PROGRESS CHECK COMMANDS

## Quick Progress (Any Agent)
```
Progress check:
- Tasks completed since last sync?
- Currently working on?
- Blocked on anything?
- ETA to next completion?
```

## Detailed Status (End of Session)
```
Session closing. Full status report:

1. COMPLETED THIS SESSION:
   - [list with commit hashes]

2. IN PROGRESS:
   - [list with % complete estimates]

3. BLOCKED:
   - [list with blocker descriptions]

4. NOT STARTED:
   - [list from assigned tasks]

5. DECISIONS NEEDED:
   - [list questions for me]

6. AI_CONTEXT.md UPDATE:
   - [draft Session Log entry]
```

---

# 💡 DIRECTIVE TIPS

## Be Specific > Be Polite
```
❌ "Could you maybe look at the auth issue when you have a chance?"
✅ "Fix issue #47. Auth token expiry. Acceptance: tests pass."
```

## Include Success Criteria
```
❌ "Make the login better"
✅ "Login: <3s load time, error messages visible, works offline"
```

## Link Don't Describe
```
❌ "Remember that thing we discussed about the API..."
✅ "See issue #52 and AI_CONTEXT.md 'Key Technical Decisions'"
```

## Timeboxes Prevent Spinning
```
❌ "Keep trying until it works"
✅ "Try for 15 min. If blocked, create issue and move on."
```

---

*Copy. Paste. Execute. Progress.*
