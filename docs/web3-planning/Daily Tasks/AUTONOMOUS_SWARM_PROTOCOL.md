# 🔄 AUTONOMOUS SWARM PROTOCOL

> **Goal:** Agents communicate via GitHub. You only intervene for decisions and blockers.

---

## The New Model

```
OLD (You as Router):
Gemini → [YOU] → Claude → [YOU] → Grok → [YOU] → Gemini

NEW (GitHub as Message Bus):
Gemini → GitHub Issue → Claude reads → GitHub Issue → Grok reads
                ↓
        [YOU only for blockers/decisions]
```

---

## How It Works

### 1. GitHub Issues = Agent Messages

Instead of Gemini telling you to tell Claude something, Gemini:
1. Creates a GitHub Issue
2. Assigns label `verifier:claude` or `handoff`
3. @mentions in the issue body (optional)
4. Claude picks it up on next sync

### 2. AI_CONTEXT.md = Shared State

All agents read/write to AI_CONTEXT.md:
- Current sprint status
- Who's working on what
- Blockers
- Decisions needed

### 3. You Only Handle:
- ❌ `blocked` issues (decisions needed)
- ❌ `critical` issues (emergencies)
- ❌ Architectural decisions
- ❌ Approving PRs to main

---

## Agent Operating Instructions

### For Gemini (Primary Executor)

```
AUTONOMOUS SWARM PROTOCOL

You are operating in swarm mode. You do NOT wait for human routing.

WHEN YOU COMPLETE A TASK:
1. Commit and push your code
2. Create GitHub Issue:
   - Title: [VERIFY] Task Name
   - Labels: verification, author:gemini, verifier:claude (or verifier:grok)
   - Body: What you built, files changed, how to verify
3. Update AI_CONTEXT.md with your progress
4. Immediately start your next task

DO NOT wait for human to route to Claude/Grok.
The verifier will pick up the issue on their next sync.

WHEN YOU NEED INPUT FROM ANOTHER AGENT:
1. Create GitHub Issue:
   - Title: [QUESTION] Your question
   - Labels: handoff, author:gemini, verifier:claude
   - Body: Context, specific question, what you need to proceed
2. Continue with other tasks while waiting
3. Check for responses on your next sync

WHEN YOU HIT A BLOCKER:
1. Create GitHub Issue:
   - Title: [BLOCKED] Brief description  
   - Labels: blocked, author:gemini
   - Body: What you tried, what failed, specific decision needed
2. Move to next task
3. Human will resolve and remove blocked label
4. Pick up unblocked task on next sync
```

### For Claude (Via Claude Code or Scheduled Sessions)

```
AUTONOMOUS SWARM PROTOCOL - CLAUDE

Check GitHub every session for:
1. Issues labeled `verifier:claude` - verify these
2. Issues labeled `handoff` to you - respond to questions
3. Your own `blocked` issues - check if unblocked

VERIFICATION WORKFLOW:
1. Read the issue
2. Pull latest code
3. Verify against acceptance criteria
4. Comment your findings on the issue
5. Add label: `approved` or `changes-requested`
6. If approved, close the issue

QUESTION RESPONSE WORKFLOW:
1. Read the question
2. Analyze and respond in issue comments
3. Add label: `answered`
4. Requesting agent will pick up on their sync

DO NOT wait for human to assign work.
GitHub Issues ARE your work queue.
```

### For Grok (Via Scheduled Sessions)

```
AUTONOMOUS SWARM PROTOCOL - GROK

Check GitHub every session for:
1. Issues labeled `verifier:grok` - verify these
2. Web3/EIP-8004 questions - you're the expert
3. Fact-checking requests

Same workflows as Claude.
Your specialty: Web3, current info, cross-referencing.
```

---

## Sync Schedule

For true autonomy, agents need regular sync points:

| Agent | Sync Frequency | Method |
|-------|---------------|--------|
| Gemini | Continuous | IDE always connected |
| Claude | Every 2-4 hours | You open Claude, run sync prompt |
| Grok | Every 4-6 hours | You open Grok, run sync prompt |

### Claude/Grok Sync Prompt

```
SWARM SYNC

1. Fetch GitHub issues: https://github.com/[ORG]/[REPO]/issues
2. Filter for labels: verifier:[your-name] OR handoff
3. For each issue:
   - Read the request
   - Complete verification or answer question
   - Comment your response
   - Update labels
4. Pull latest AI_CONTEXT.md
5. Report: What you processed, any new blockers

This is a sync, not a conversation. Process the queue and report.
```

---

## Your New Role

### Morning (10 min)
```
1. Check GitHub for `blocked` issues
2. Make decisions, comment, remove blocked label
3. Quick sync prompt to Claude if needed
4. Done - agents continue autonomously
```

### Daytime (5 min total)
```
1. Check phone for `critical` notifications
2. Only intervene if truly blocked
3. Agents self-coordinate via GitHub
```

### Evening (15 min)
```
1. Review what shipped (closed issues)
2. Queue overnight tasks (create issues)
3. Send overnight prompt to Gemini
4. Agents run all night
```

---

## Issue Templates for Agent Communication

### Agent-to-Agent Verification Request
```markdown
Title: [VERIFY] [Task Name]
Labels: verification, author:[agent], verifier:[different-agent]

## What Was Built
[Description]

## Files Changed
- /path/to/file1
- /path/to/file2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## How to Verify
1. Step 1
2. Step 2

## Notes for Verifier
[Any context needed]
```

### Agent-to-Agent Question
```markdown
Title: [QUESTION] [Brief question]
Labels: handoff, author:[agent], verifier:[target-agent]

## Context
[What I'm working on]

## Specific Question
[Clear question]

## What I Need to Proceed
[Specific deliverable or decision]

## My Current Thinking
[Optional: what I think the answer might be]
```

### Agent Blocker (Needs Human)
```markdown
Title: [BLOCKED] [Brief description]
Labels: blocked, author:[agent]

## What I'm Trying to Do
[Task description]

## What I Tried
1. Attempt 1: [result]
2. Attempt 2: [result]
3. Attempt 3: [result]

## Specific Decision Needed
[Clear question for human]

## Options I See
- Option A: [description]
- Option B: [description]

## My Recommendation
[If you have one]
```

---

## Reducing Your Touchpoints

| Current | After Protocol | Reduction |
|---------|---------------|-----------|
| Route every handoff | Only blockers | -80% |
| Copy-paste between agents | Agents use GitHub | -90% |
| Watch verifications | Auto-labeled, you review closed | -70% |
| Constant context | Sync prompts 2-3x/day | -60% |

---

## Implementation

### Step 1: Update Gemini's Operating Instructions (Tonight)

Add to evening handoff:
```
SWARM MODE ACTIVE

You do NOT wait for me to route to other agents.
When you complete a task:
1. Create verification issue with verifier:claude or verifier:grok
2. They will pick it up on their sync
3. Continue to your next task

I will run Claude/Grok syncs 2-3x per day.
Use GitHub Issues as your communication channel.
```

### Step 2: Schedule Claude/Grok Syncs

Set phone reminders:
- 9am: Claude sync (5 min)
- 2pm: Grok sync (5 min)  
- 6pm: Claude sync (5 min)

### Step 3: Only Monitor Blockers

Set GitHub notification filter:
- Notify on: `blocked` label, `critical` label
- Ignore: Everything else (agents handle it)

---

## The Goal State

```
YOUR DAILY INVOLVEMENT:
├── Morning: Resolve blockers (10 min)
├── 9am: Claude sync prompt (5 min)
├── 2pm: Grok sync prompt (5 min)
├── 6pm: Claude sync prompt (5 min)
├── Evening: Queue overnight + Gemini handoff (15 min)
└── TOTAL: ~40 min

AGENT COORDINATION: 
├── Gemini → GitHub Issue → Claude (no you)
├── Claude → GitHub Issue → Grok (no you)
├── Grok → GitHub Issue → Gemini (no you)
└── You only: blockers + decisions
```

---

*"The best router is no router. Let GitHub be the message bus."*
