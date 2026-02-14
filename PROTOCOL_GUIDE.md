# Trinity Symphony Multi-Agent Protocol Guide

> **"Efficiency over engagement"** - This guide exists to minimize friction while maximizing coordination quality across Claude, Gemini, and Grok.

---

## 📋 Table of Contents

1. [Core Principles](#core-principles)
2. [Agent Roles & Strengths](#agent-roles--strengths)
3. [The Heterogeneous Protocol](#the-heterogeneous-protocol)
4. [Daily Workflow](#daily-workflow)
5. [Communication Patterns](#communication-patterns)
6. [Handoff Protocol](#handoff-protocol)
7. [Verification Protocol](#verification-protocol)
8. [Emergency Procedures](#emergency-procedures)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Quick Reference Card](#quick-reference-card)

---

## Core Principles

### The Three Laws of Trinity Coordination

1. **Single Source of Truth**
   - `AI_CONTEXT.md` is the canonical state
   - Update it BEFORE ending any session
   - Read it BEFORE starting any session

2. **Heterogeneous Verification**
   - Author ≠ Verifier (always different LLMs)
   - Different data sources for cross-validation
   - No echo chambers

3. **Minimal Viable Context**
   - Transfer only what's needed
   - Don't repeat what's in AI_CONTEXT.md
   - Link, don't copy

---

## Agent Roles & Strengths

### Primary Assignments

| Agent | Primary Role | Strengths | Best For |
|-------|--------------|-----------|----------|
| **Claude** | Orchestration (ORCH) | Complex reasoning, architecture, code review | Planning, ANFIS routing, documentation |
| **Gemini** | Execution (SHOFET) | IDE integration, sustained context, building | PWA development, file operations, execution |
| **Grok** | Verification (W3C) | Real-time info, less filtered, Web3 knowledge | EIP-8004, dispute detection, fact-checking |

### When to Use Which Agent

```
PLANNING & ARCHITECTURE
└── Start with Claude
    ├── Define requirements
    ├── Design system
    └── Create specifications

BUILDING & EXECUTION  
└── Hand off to Gemini
    ├── Write code
    ├── Modify files
    └── Run tests

VERIFICATION & RESEARCH
└── Hand off to Grok
    ├── Verify implementation
    ├── Check Web3 specs
    └── Cross-reference sources

REVIEW & REFINEMENT
└── Return to Claude
    ├── Review Grok's findings
    ├── Approve or iterate
    └── Update documentation
```

---

## The Heterogeneous Protocol

### Why It Exists

Single-LLM systems create blind spots. Each LLM has:
- Training data biases
- Reasoning patterns
- Knowledge gaps

Cross-LLM verification catches errors that same-LLM review misses.

### The Rules

#### Rule 1: Different Author and Verifier
```
✅ CORRECT:
   Author: Claude → Verifier: Gemini or Grok
   Author: Gemini → Verifier: Claude or Grok
   Author: Grok → Verifier: Claude or Gemini

❌ VIOLATION:
   Author: Claude → Verifier: Claude
```

#### Rule 2: Different Data Sources
```
✅ CORRECT:
   Author used: EIP-8004 spec + Supabase schema
   Verifier uses: 8004.org docs + live testnet query

❌ VIOLATION:
   Both use: Same documentation page
```

#### Rule 3: Squad Diversity
```
✅ CORRECT (within a 3-agent squad):
   Agent 1: Claude
   Agent 2: Gemini  
   Agent 3: Grok

❌ VIOLATION:
   Agent 1: Claude
   Agent 2: Claude
   Agent 3: Gemini
```

### Enforcement

The GitHub Action `heterogeneous-protocol.yml` automatically:
- Checks labels on verification/handoff issues
- Flags violations with comments
- Adds `protocol-violation` label
- Blocks merge until resolved

---

## Daily Workflow

### Morning Startup (or Session Start)

```
┌─────────────────────────────────────────────────────────┐
│ 1. SYNC                                                 │
│    └── Read AI_CONTEXT.md                               │
│        ├── Check "Current Sprint Status" table          │
│        ├── Review "Session Log" for recent updates      │
│        └── Note any blockers                            │
│                                                         │
│ 2. CLAIM                                                │
│    └── Update your task status to "🔄 IN PROGRESS"      │
│                                                         │
│ 3. WORK                                                 │
│    └── Execute your assigned tasks                      │
│                                                         │
│ 4. LOG                                                  │
│    └── Update AI_CONTEXT.md before ending               │
│        ├── Add entry to Session Log                     │
│        ├── Update task statuses                         │
│        └── Note any handoffs needed                     │
└─────────────────────────────────────────────────────────┘
```

### Starting an AI Session

**Standard Opening (copy this):**

For Claude (Web):
```
Please fetch and read https://raw.githubusercontent.com/[ORG]/trinity-ecosystem/main/AI_CONTEXT.md

Then tell me:
1. What's my current sprint status?
2. What tasks are assigned to you?
3. Are there any blockers?
```

For Claude Code:
```
Read AI_CONTEXT.md in the project root and summarize:
1. Current sprint status
2. Your assigned tasks
3. Any blockers
```

For Gemini (Antigravity):
```
Check AI_CONTEXT.md for current state. What's next on my task list?
```

For Grok:
```
Read this file and tell me what needs verification:
[paste raw GitHub URL to AI_CONTEXT.md]
```

### Ending an AI Session

**Standard Closing (ask the AI):**
```
Before we end, please give me an update for AI_CONTEXT.md:

1. Session Log entry (date, agent, what was done)
2. Any task status changes
3. Handoff notes if applicable
4. Blockers discovered
```

Then commit the update:
```bash
git add AI_CONTEXT.md
git commit -m "Update AI_CONTEXT.md - [brief description]"
git push
```

---

## Communication Patterns

### Pattern 1: Simple Task (No Handoff)

```
YOU ──────► AGENT ──────► DONE
            │
            └── Update AI_CONTEXT.md
```

**Example:** Ask Claude to review a code snippet.

### Pattern 2: Build & Verify (Standard)

```
YOU ──► GEMINI ──► builds ──► GROK ──► verifies ──► DONE
            │                    │
            └── Handoff Issue    └── Verification Issue
```

**Example:** Gemini builds PWA component, Grok verifies.

### Pattern 3: Plan → Build → Review (Full Cycle)

```
YOU ──► CLAUDE ──► plans ──► GEMINI ──► builds ──► GROK ──► verifies ──► CLAUDE ──► reviews ──► DONE
            │                    │                    │                      │
            └── Spec created     └── Handoff          └── Verification       └── Approval
```

**Example:** New feature requiring architecture decisions.

### Pattern 4: Research & Synthesize

```
YOU ──► GROK ──► researches ──► CLAUDE ──► synthesizes ──► GEMINI ──► implements
            │                       │                          │
            └── Findings            └── Recommendations        └── Code
```

**Example:** Investigating new Web3 standard for integration.

---

## Handoff Protocol

### When to Create a Handoff

Create a **Handoff Issue** when:
- [ ] Task requires a different agent's strengths
- [ ] You're ending a session mid-task
- [ ] Verification is needed
- [ ] Context is complex (>2 paragraphs to explain)

### Handoff Checklist (Sending Agent)

```markdown
## Pre-Handoff Checklist

- [ ] All code committed and pushed
- [ ] AI_CONTEXT.md updated with current status
- [ ] No uncommitted local changes
- [ ] Handoff Issue created with:
      - [ ] Clear task description
      - [ ] Acceptance criteria
      - [ ] Files involved
      - [ ] Context & dependencies
      - [ ] Verification instructions
- [ ] Labels applied:
      - [ ] `handoff`
      - [ ] `author:[your-agent]`
      - [ ] `verifier:[target-agent]`
```

### Handoff Checklist (Receiving Agent)

```markdown
## Acceptance Checklist

- [ ] Read AI_CONTEXT.md FIRST
- [ ] Read Handoff Issue completely
- [ ] Confirm understanding (comment on issue)
- [ ] Verify I'm using DIFFERENT LLM than author
- [ ] Identify my data sources (different from author's)
- [ ] Begin work
- [ ] Update issue with "Accepted" comment
```

### Handoff Issue Template Quick Reference

```markdown
## Handoff: [From] → [To]
**Task:** [One line]
**Files:** [List]
**Context:** [2-3 sentences max]
**Acceptance:** [Bullet list]
**Risks:** [What might go wrong]
```

---

## Verification Protocol

### When Verification is Required

**Always required for:**
- [ ] Any code that will be merged to main
- [ ] Database schema changes
- [ ] Smart contract modifications
- [ ] Security-sensitive changes
- [ ] Public-facing UI changes

**Optional for:**
- Documentation updates
- Config file changes
- Test file additions

### Verification Levels

| Level | Depth | When to Use |
|-------|-------|-------------|
| **Quick** | Read code, check logic | Small changes, low risk |
| **Standard** | Run tests, verify behavior | Normal features |
| **Deep** | Full audit, edge cases, security | Critical systems, Web3 |

### Verification Report Structure

```markdown
## Verification Report

**Verifier:** [Agent]
**LLM Used:** [Must differ from author]
**Level:** Quick / Standard / Deep

### Tests Run
- [ ] Test 1: [result]
- [ ] Test 2: [result]

### Issues Found
1. [Issue]: [Severity] - [Description]

### Verdict
✅ APPROVED / ⚠️ APPROVED WITH NOTES / ❌ CHANGES REQUESTED
```

---

## Emergency Procedures

### Production Incident

```
1. STOP all non-critical work
2. Create Bug Issue with label: `critical`
3. All agents focus on resolution
4. Heterogeneous Protocol still applies (no shortcuts)
5. Post-mortem after resolution
```

### Context Corruption

If AI_CONTEXT.md becomes outdated or incorrect:

```
1. Check git history: git log AI_CONTEXT.md
2. Identify last known good state
3. Restore or manually correct
4. Add Session Log entry explaining correction
5. Notify all agents in next session
```

### Agent Disagreement

When Claude, Gemini, and Grok disagree:

```
1. Document each position in an Issue
2. Identify the factual basis for each
3. Check external sources (not LLM opinions)
4. Escalate to Sean for final decision
5. Record decision in Decision Record (ADR)
```

---

## Anti-Patterns to Avoid

### ❌ The Echo Chamber
```
Problem: Using same agent for author AND verification
Why bad: Misses systematic biases
Fix: Enforce Heterogeneous Protocol
```

### ❌ The Context Dump
```
Problem: Copying entire conversation history between agents
Why bad: Wastes tokens, buries signal in noise
Fix: Link to AI_CONTEXT.md, summarize key points only
```

### ❌ The Assumption Trap
```
Problem: Assuming database schema, file structure, or state
Why bad: Causes cascading errors
Fix: Always query/verify before acting
```

### ❌ The Drive-By Fix
```
Problem: Fixing something without updating AI_CONTEXT.md
Why bad: Next agent doesn't know about change
Fix: Update context BEFORE ending session
```

### ❌ The Scope Creep
```
Problem: "While I'm here, let me also refactor..."
Why bad: Introduces untracked changes, breaks verification
Fix: One task per issue, stay focused
```

### ❌ The Orphan Handoff
```
Problem: Creating handoff but not updating AI_CONTEXT.md
Why bad: Receiving agent misses context
Fix: Always update both
```

---

## Quick Reference Card

### Session Start
```
1. Read AI_CONTEXT.md
2. Check your tasks
3. Note blockers
```

### During Work
```
1. Stay focused on assigned task
2. Don't assume - verify
3. Commit frequently
```

### Session End
```
1. Update AI_CONTEXT.md Session Log
2. Update task statuses
3. Create Handoff Issue if needed
4. Commit and push
```

### Labels Cheat Sheet
```
author:claude    - Claude created this work
author:gemini    - Gemini created this work
author:grok      - Grok created this work
verifier:claude  - Claude should verify
verifier:gemini  - Gemini should verify
verifier:grok    - Grok should verify
handoff          - Cross-agent transfer
verification     - Needs cross-agent review
protocol-violation - Heterogeneous rule broken
critical         - Production incident
blocked          - Cannot proceed
```

### Communication Shortcuts

**Ping for Review:**
```
"This is ready for verification. Please create Verification Request issue."
```

**Acknowledge Handoff:**
```
"Handoff received. Reading AI_CONTEXT.md now."
```

**Report Blocker:**
```
"Blocked on [X]. Updated AI_CONTEXT.md. Need [specific help]."
```

**Request Clarification:**
```
"Before proceeding: [specific question]. This affects [scope]."
```

---

## Metrics We Track

### Health Indicators

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Protocol violations/week | 0 | 1-2 | 3+ |
| Handoffs without context update | 0 | 1 | 2+ |
| Verification turnaround | <4 hrs | 4-8 hrs | >8 hrs |
| Session without AI_CONTEXT.md update | 0 | 1 | 2+ |

### Sprint Velocity

Track in AI_CONTEXT.md:
- Tasks completed per week
- Handoffs per task (lower is better)
- Verification pass rate (first attempt)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-13 | Initial protocol guide |

---

*"For the last, the lost, and the least" - Trinity Symphony Protocol v1.0*
