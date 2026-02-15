# 🌅 DAILY RITUALS: Agent Command Center

> **Your job:** Unblock, decide, verify. **Agent job:** Execute, commit, report.

---

# ☀️ MORNING RITUAL (15-20 min)

## Step 1: Scan GitHub (5 min)

Open in order:
1. **Notifications** → What happened overnight?
2. **Issues with `blocked` label** → What needs you?
3. **PRs awaiting review** → What's ready to merge?
4. **Actions tab** → Any workflow failures?

```
Quick mental model:
├── 🔴 Blocked issues = Your priority
├── 🟡 PRs waiting = Quick approvals
├── 🟢 Closed issues = Progress made
└── ⚪ New issues = Agents asking questions
```

## Step 2: Review AI_CONTEXT.md (3 min)

Pull latest:
```bash
git pull origin main
```

Check Session Log:
- What did each agent accomplish?
- Any blockers noted?
- Any decisions needed?

## Step 3: Unblock with LLMs (5-10 min)

For each `blocked` issue:

**If Architecture/Planning blocked:**
```
[To Claude]
Read this GitHub issue: [URL]
Read AI_CONTEXT.md: [URL]
Help me unblock this. What's the decision needed?
```

**If Web3/EIP-8004 blocked:**
```
[To Grok]
Read this GitHub issue: [URL]
This is blocked on Web3 knowledge. What's the answer?
```

**If Execution/Build blocked:**
```
[To Gemini]
Read this GitHub issue: [URL]
You built this. Why is it stuck? What's missing?
```

## Step 4: Queue Today's Work (5 min)

Create Sprint Task issues for each agent:
- Clear title
- Specific acceptance criteria
- Files involved
- Assign `author:` and `verifier:` labels

**Template command to any LLM:**
```
Based on AI_CONTEXT.md current state, what are the top 3 tasks 
for [Claude/Gemini/Grok] today? Create Sprint Task issues.
```

## Step 5: Start Agents

**If using Gemini (Antigravity) IDE:**
```
Good morning. Pull latest AI_CONTEXT.md and check GitHub Issues 
assigned to you. Execute in priority order. Commit after each task.
Create Verification Request when done.
```

**Morning ritual complete. Go live your life. ☕**

---

# 📱 DAYTIME CHECK-INS (Mobile, 2-3x)

## Quick Scan (2 min each)

1. **GitHub Mobile App** or **PWA Controller**
   - Any new `blocked` labels?
   - Any Verification Requests waiting?

2. **If blocker found:**
   - Can you resolve from phone? Do it.
   - Need LLM? Note it for evening or quick Claude mobile chat.

3. **If verification waiting:**
   - Quick review - approve or comment
   - Don't let verification queue build up

## Quick Unblock Pattern (Mobile)

```
[Quick message to appropriate LLM]
Blocked issue: [paste URL]
Quick decision needed: [one line problem]
Recommend: A or B?
```

Get answer → Comment on issue → Remove `blocked` label → Done.

---

# 🌙 EVENING RITUAL (20-30 min)

## Step 1: Harvest the Day (10 min)

**Review all closed issues today:**
- What shipped?
- Update `AI_CONTEXT.md` sprint status
- Celebrate wins (even small ones)

**Review all open issues:**
- What's in progress?
- What's blocked?
- What's ready for overnight?

## Step 2: Overnight Prep (10 min)

### Queue Overnight Tasks

Create issues with VERY clear criteria:

```markdown
## Overnight Task: [Name]

**Agent:** [author:X]
**Verifier:** [verifier:Y - different agent]

**Acceptance Criteria:**
- [ ] Specific thing 1 exists and works
- [ ] Specific thing 2 passes test
- [ ] Code committed to branch X

**If Blocked:**
- Create issue with `blocked` label
- Include: what you tried, what failed, what you need
- DO NOT spin - escalate immediately

**Estimated Time:** X hours
**Priority:** 1 of N tonight
```

### Overnight Rules (Include in each task)

```markdown
## Overnight Operating Rules

1. Execute tasks in priority order
2. Commit after each completed task
3. Create Verification Request when task done
4. If blocked > 15 min, create blocked issue and move to next task
5. Do NOT make architectural decisions - flag for morning
6. Do NOT delete or simplify existing code
7. Update AI_CONTEXT.md Session Log before stopping
```

## Step 3: Final Sync (5 min)

**Update AI_CONTEXT.md:**
```markdown
### [Date] Evening - Sean
- Completed today: [list]
- Queued for overnight: [list]
- Blockers to resolve tomorrow: [list]
- Decisions pending: [list]
```

**Commit and push:**
```bash
git add AI_CONTEXT.md
git commit -m "Evening sync - overnight tasks queued"
git push
```

## Step 4: Start Overnight Run

**To Gemini (Antigravity):**
```
It's evening. I'm going offline until morning.

Your overnight instructions:
1. Pull latest AI_CONTEXT.md
2. Check GitHub Issues assigned to you, priority order
3. Execute each task completely before starting next
4. Commit after each task
5. Create Verification Request when done
6. If blocked > 15 min, create issue with `blocked` label and move on
7. Update AI_CONTEXT.md Session Log when you stop

No architectural decisions without me. Flag and continue.
Execute until all overnight tasks done or you hit blockers.
```

**Evening ritual complete. Sleep well. 😴**

---

# 🔄 WEEKLY RHYTHM

## Monday: Sprint Planning
- Review last week's velocity
- Set weekly goals
- Queue first batch of tasks

## Wednesday: Mid-Sprint Check
- Are we on track?
- Any systemic blockers?
- Adjust priorities if needed

## Friday: Sprint Review
- What shipped?
- What didn't? Why?
- Process improvements for next week

## Weekend: Optional
- Let agents continue if momentum is good
- Or pause for your own rest
- Batch any non-urgent decisions for Monday

---

# 📊 METRICS TO TRACK

## Daily
- Tasks completed (by agent)
- Blockers created
- Blockers resolved
- Protocol violations

## Weekly
- Total tasks completed
- Overnight vs daytime productivity ratio
- Human intervention rate
- Average task completion time

## Target State (After Week 1)
```
Morning ritual:     15 min
Daytime check-ins:  3 x 2 min = 6 min
Evening ritual:     25 min
─────────────────────────────
Total daily:        ~45 min human time

Overnight output:   8-10 hours autonomous work
Daytime output:     Continuous background execution

Effective multiplier: 10-15x your direct coding time
```

---

# 🚨 EMERGENCY PROTOCOLS

## If Everything Is Blocked
1. Stop all agents
2. Assess: Is this a systemic issue?
3. Fix root cause (usually unclear requirements)
4. Update `PROTOCOL_GUIDE.md` to prevent recurrence
5. Resume with clearer instructions

## If Agent Goes Off-Track
1. Check git diff - what did it actually do?
2. Revert if needed: `git revert HEAD`
3. Create issue documenting what went wrong
4. Update task template to prevent recurrence

## If Context Is Stale
1. `git pull` to get latest
2. Manually audit `AI_CONTEXT.md` vs reality
3. Fix discrepancies
4. Add Session Log entry explaining
5. Resume

---

# 💡 PRO TIPS

## For Faster Mornings
- Use GitHub mobile notifications - check before getting out of bed
- Keep Claude mobile chat open for quick unblocks
- Don't context-switch - batch all unblocks together

## For Better Overnights
- More specific = more autonomous
- Include example outputs when possible
- Link to similar completed tasks as reference
- Err on the side of over-specifying

## For Sustainable Pace
- Your job is decisions, not execution
- If you're writing code, something is wrong
- Trust the process - agents will learn your patterns
- Rest is productive - overnight work happens anyway

---

*"You decide. Agents execute. GitHub synchronizes. Progress compounds."*
