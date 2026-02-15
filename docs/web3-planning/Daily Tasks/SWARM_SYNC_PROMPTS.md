# 🔄 SWARM SYNC PROMPTS

> **Use these prompts 2-3x daily to let Claude/Grok process their queues.**
> **Each sync takes ~5 minutes of your time.**

---

## CLAUDE SYNC PROMPT

Copy and send to Claude (Web or Code) 2-3x per day:

```
SWARM SYNC - CLAUDE

You are syncing with the Trinity Swarm. Process your queue autonomously.

REPOSITORY: https://github.com/[ORG]/trinity-ecosystem
AI_CONTEXT: https://raw.githubusercontent.com/[ORG]/trinity-ecosystem/main/AI_CONTEXT.md

STEP 1: CHECK YOUR QUEUE
Fetch issues with these labels:
- verifier:claude (verification requests for you)
- handoff + mentions claude (questions for you)
- author:claude + blocked (your blocked items - check if unblocked)

STEP 2: PROCESS EACH ITEM

For VERIFICATION requests:
1. Read what was built
2. Check the code/changes
3. Verify against acceptance criteria
4. Comment your findings on the issue
5. Add label: approved OR changes-requested
6. If approved and trivial, close the issue

For QUESTIONS:
1. Read the context
2. Provide your answer/recommendation
3. Comment on the issue
4. Add label: answered

For UNBLOCKED items:
1. Note what was resolved
2. Update AI_CONTEXT.md if needed
3. Flag if you can now proceed with something

STEP 3: REPORT

Tell me:
1. Issues processed: [list with outcomes]
2. New blockers found: [any]
3. Decisions I need to make: [any]
4. AI_CONTEXT.md updates needed: [any]

DO NOT wait for my input between items.
Process the entire queue, then report.
```

---

## GROK SYNC PROMPT

Copy and send to Grok 1-2x per day:

```
SWARM SYNC - GROK

You are syncing with the Trinity Swarm. Process your queue autonomously.

REPOSITORY: https://github.com/[ORG]/trinity-ecosystem
FOCUS: Web3, EIP-8004, fact-checking, verification

STEP 1: CHECK YOUR QUEUE
Fetch issues with these labels:
- verifier:grok (verification requests for you)
- Any Web3/EIP-8004 related questions
- author:grok + blocked (your blocked items)

STEP 2: PROCESS EACH ITEM

For VERIFICATION requests:
1. Read what was built
2. Cross-reference against EIP-8004 spec if applicable
3. Use DIFFERENT sources than the author
4. Comment your findings
5. Add label: approved OR changes-requested

For WEB3 QUESTIONS:
1. Research using current sources
2. Provide authoritative answer
3. Include source links
4. Comment on the issue

STEP 3: REPORT

Tell me:
1. Issues processed: [list]
2. Web3 concerns found: [any]
3. Spec compliance issues: [any]
4. Recommendations: [any]

Process entire queue, then report.
```

---

## GEMINI SWARM MODE UPDATE

Add this to Gemini's operating instructions:

```
SWARM MODE PROTOCOL

You are now operating in swarm mode with autonomous agent coordination.

WHEN YOU COMPLETE ANY TASK:

1. DO NOT wait for human to route to another agent
2. Create GitHub Issue immediately:
   
   Title: [VERIFY] [Task Name]
   Labels: verification, author:gemini, verifier:claude (or verifier:grok)
   
   Body:
   ## What Was Built
   [Description]
   
   ## Files Changed
   [List]
   
   ## Verify By
   [Steps]

3. Update AI_CONTEXT.md with your completion
4. IMMEDIATELY start your next priority task

The verifier will pick up the issue when they sync.
You do NOT need human to relay messages.

WHEN YOU NEED INPUT:

1. Create issue with label: handoff, verifier:[target-agent]
2. Continue other work while waiting
3. Check for responses on subsequent syncs

WHEN BLOCKED:

1. Create issue with label: blocked
2. This DOES need human - they handle blocked issues
3. Move to next task

GitHub Issues = Your communication channel
AI_CONTEXT.md = Shared state
Human = Only for blockers and decisions
```

---

## QUICK MOBILE SYNC (1 min each)

When you just want to check if anything needs you:

### Claude Quick Check
```
Quick sync: Any issues labeled verifier:claude or blocked needing me?
Just list them, I'll process on desktop.
```

### Grok Quick Check  
```
Quick sync: Any Web3 verification or questions waiting?
List issues, I'll process later.
```

---

## OVERNIGHT SYNC SETUP

Before bed, ensure Gemini knows to use swarm mode:

```
OVERNIGHT SWARM OPERATION

Continue autonomous operation.

Remember:
- Create verification issues for completed work
- Label with verifier:claude or verifier:grok
- They sync in the morning, not tonight
- You do NOT need to wait for them
- Process your task queue continuously
- Only create 'blocked' issues for true blockers

I will run Claude/Grok syncs first thing in the morning.
Your verification requests will be processed then.

Continue executing. Good night.
```

---

## YOUR NEW SCHEDULE

```
MORNING (15 min total):
├── Check blocked issues (5 min)
├── Claude sync prompt (5 min)
├── Grok sync prompt (5 min)
└── Agents continue autonomously

MIDDAY (5 min):
└── Claude sync prompt (optional)

AFTERNOON (5 min):
└── Grok sync prompt

EVENING (20 min):
├── Review closed issues (5 min)
├── Claude sync prompt (5 min)
├── Queue overnight tasks (5 min)
└── Gemini overnight handoff (5 min)
```

---

## NOTIFICATION SETUP

Configure GitHub notifications:

**Email/Push immediately:**
- Issues labeled `blocked`
- Issues labeled `critical`

**Daily digest or ignore:**
- All other issue activity (agents handle it)

This way you only get pinged when you're actually needed.

---

## THE KEY INSIGHT

```
OLD: You are the router
     Every message flows through you
     Agents wait for you to relay

NEW: GitHub is the router
     Agents post issues directly
     You only handle exceptions
     
RESULT: 
- Agents work 24/7
- You work 40 min/day
- Progress doesn't wait for you
```

---

*"The swarm doesn't need a conductor. It needs a shared scoreboard."*
