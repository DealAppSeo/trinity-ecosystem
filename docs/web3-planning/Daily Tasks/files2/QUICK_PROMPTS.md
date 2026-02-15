# 🚀 QUICK PROMPTS: Copy-Paste Ready

> **These are the minimal but complete versions. Copy, customize bracketed items, paste.**

---

# ☀️ MORNING STARTUP (Send to Gemini)

```
MORNING STARTUP

1. Pull latest: git pull origin main
2. Run health check: node scripts/verify-context.mjs
3. Check GitHub for issues labeled `blocked`

Report:
- Health check results
- Any blocked issues
- What you completed overnight
- What's ready for verification

Then wait for my task assignments.
```

---

# 🌙 EVENING HANDOFF (Send to Gemini)

## Short Version (For Simple Nights)

```
OVERNIGHT AUTONOMOUS OPERATION

I'm offline until morning.

TASKS (in order):
1. [TASK 1 - be specific]
2. [TASK 2 - be specific]
3. [TASK 3 - be specific]

RULES:
- Max 3 retries per operation, then create `blocked` issue and move on
- Never use npx for gh/docker/kubectl (not npm packages)
- Commit after each completed task
- Update AI_CONTEXT.md before stopping
- No architectural decisions - flag for morning

BOUNDARIES:
- DO NOT delete existing code
- DO NOT assume database schemas
- DO NOT merge PRs

If blocked >15 min: create issue, move to next task.

Confirm you understand, then begin.
```

## Full Version (For Complex Nights)

```
OVERNIGHT AUTONOMOUS OPERATION - FULL PROTOCOL

I'm offline until morning (~8 hours).

PRE-FLIGHT:
1. git pull origin main
2. node scripts/verify-context.mjs
3. If critical errors: STOP, create blocked issue

TONIGHT'S TASKS (priority order):

Task 1: [NAME]
- Files: [list]
- Done when: [specific criteria]
- Time: [estimate]

Task 2: [NAME]
- Files: [list]
- Done when: [specific criteria]
- Time: [estimate]

Task 3: [NAME]
- Files: [list]
- Done when: [specific criteria]
- Time: [estimate]

SAFETY RULES (CRITICAL):
⚠️ MAX 3 RETRIES - then stop, log, create blocked issue, move on
⚠️ VERIFY TOOLS EXIST before using (command -v <tool>)
⚠️ NEVER npx for non-npm tools (gh, docker, etc.)
⚠️ 15 MIN MAX on any uncertainty - then escalate
⚠️ NO infinite loops or unbounded retries

BOUNDARIES:
✅ Write code, fix bugs, add tests, create PRs
❌ Architectural decisions
❌ Delete/refactor existing code
❌ Change DB schema
❌ Merge to main
❌ Assume column names (query first)

AFTER EACH TASK:
1. Commit: git commit -m "[TASK] description"
2. Push: git push
3. Create verification request issue

BEFORE STOPPING:
1. Update AI_CONTEXT.md Session Log
2. Commit and push
3. Create "Overnight Report [DATE]" issue

Confirm understanding, then begin.
```

---

# 🛑 EMERGENCY STOP (Any Time)

```
STOP.

Terminate current operation immediately.
Do not commit anything.
Do not continue.

Report:
1. What you were doing
2. Current state of files
3. Any uncommitted changes

Wait for instructions.
```

---

# 🔄 RESUME AFTER BREAK

```
RESUME OPERATIONS.

1. git pull origin main
2. Check AI_CONTEXT.md for updates from other agents
3. Review any verification feedback on your PRs
4. Continue with next priority task

What's your current status?
```

---

# ❓ QUICK UNBLOCK REQUEST (To Claude or Grok)

```
UNBLOCK REQUEST

Issue: [URL or #number]
Agent stuck: Gemini
Error: [one line description]

Please analyze and provide:
1. Root cause
2. Recommended fix
3. Comment I can paste to unblock

Keep it brief.
```

---

# ✅ VERIFICATION REQUEST (To Grok or Claude)

```
VERIFICATION NEEDED

Issue: [URL]
Author: Gemini
What was built: [brief description]
Files changed: [list]

Please verify using DIFFERENT sources than author used.
Check against specs/requirements.
Report: APPROVED or CHANGES REQUESTED

Post findings to the GitHub issue.
```

---

# 📊 STATUS CHECK (Any Agent)

```
Quick status:
- What's done?
- What's in progress?
- What's blocked?
- ETA on current task?
```

---

# 🧹 CONTEXT CLEANUP (Weekly)

```
CONTEXT MAINTENANCE

1. Archive completed items from AI_CONTEXT.md (>7 days old)
2. Verify all task statuses match GitHub
3. Remove stale session log entries
4. Check for orphaned issues

Report what you cleaned up.
```

---

## 📋 CUSTOMIZATION TEMPLATES

### For PWA Tasks:
```
Task: [PWA Feature Name]
- Files: /pwa/components/[X].tsx, /pwa/pages/[Y].tsx
- Done when: 
  - Component renders without errors
  - Passes TypeScript check (npx tsc --noEmit)
  - Works on mobile viewport (test at 375px width)
- Time: [X] hours
```

### For Backend Tasks:
```
Task: [API/Backend Feature]
- Files: /gateway/[X].ts, /py-brain/[Y].py
- Done when:
  - All tests pass
  - No TypeScript/Python errors
  - Endpoint responds correctly (test with curl)
- Time: [X] hours
```

### For Database Tasks:
```
Task: [Database Change]
- Files: /supabase/migrations/[X].sql
- Done when:
  - Migration runs without errors
  - Schema matches expected structure
  - Existing data not corrupted
- IMPORTANT: Query schema first, DO NOT assume column names
- Time: [X] hours
```

### For Documentation Tasks:
```
Task: [Documentation Update]
- Files: /docs/[X].md, README.md
- Done when:
  - All links work
  - Code examples are accurate
  - Formatting is consistent
- Time: [X] hours
```
