# Trinity Symphony: First Week Onboarding Checklist

> **Goal:** By end of Week 1, agents run autonomously overnight with LLM check-ins morning/evening.

---

## Day 0: Setup (30 minutes)

### Repository Setup
- [ ] Extract `trinity-protocol-complete.zip` to `trinity-ecosystem` repo
- [ ] Update `config.yml` with your GitHub org name
- [ ] Run `./setup-labels.sh YOUR_ORG/trinity-ecosystem`
- [ ] Commit and push all files
- [ ] Verify GitHub Action is active (check Actions tab)

### Initial Context
- [ ] Update `AI_CONTEXT.md` with current sprint state
- [ ] Add all 8 Railway agents to the registry section
- [ ] Verify Supabase URLs are correct
- [ ] Set current date in Session Log

### Agent Briefing
- [ ] Share `PROTOCOL_GUIDE.md` with Gemini (Antigravity)
- [ ] Brief Grok on Heterogeneous Protocol
- [ ] Confirm all agents can access raw GitHub URL for `AI_CONTEXT.md`

---

## Day 1: First Full Cycle

### Morning (Your Start-of-Day)
- [ ] Run morning checklist (see `DAILY_RITUALS.md`)
- [ ] Review overnight GitHub activity (Issues, PRs, commits)
- [ ] Identify blockers from agent Session Logs
- [ ] Unblock any stuck agents with LLM consultation
- [ ] Assign day's tasks via Sprint Task issues

### Daytime (Periodic Mobile Check-ins)
- [ ] Check GitHub notifications (2-3 times)
- [ ] Review any Verification Requests
- [ ] Approve or request changes
- [ ] Quick LLM consultation if agents need decisions

### Evening (Your End-of-Day)
- [ ] Run evening checklist (see `DAILY_RITUALS.md`)
- [ ] Review all completed work
- [ ] Queue overnight tasks
- [ ] Verify agents have clear acceptance criteria
- [ ] Confirm no blockers before overnight run

### Overnight (Autonomous)
- [ ] Agents execute queued tasks
- [ ] Agents commit to GitHub
- [ ] Agents create issues for blockers
- [ ] Agents request verification when done

---

## Day 2: Optimization

### Morning Review
- [ ] Measure: How much got done overnight?
- [ ] Identify: What blocked autonomous progress?
- [ ] Fix: Update task definitions or acceptance criteria
- [ ] Document: Add learnings to `PROTOCOL_GUIDE.md`

### Process Refinements
- [ ] Are handoffs clear enough for overnight work?
- [ ] Are acceptance criteria specific enough?
- [ ] Do agents know when to stop vs. escalate?
- [ ] Is GitHub the right sync point? (vs. Supabase)

---

## Day 3: Scale Test

### Increase Parallelism
- [ ] Assign tasks to multiple agents simultaneously
- [ ] Test: ALPHA squad + GAMMA squad working in parallel
- [ ] Verify: No conflicts, proper branch management
- [ ] Verify: Cross-squad verification working

### Mobile Controller
- [ ] Deploy mobile PWA (if not done)
- [ ] Test: Can you review/approve from phone?
- [ ] Test: Can you unblock agents from phone?
- [ ] Test: Push notifications for blockers?

---

## Day 4: Full Autonomy Test

### 24-Hour Autonomous Run
- [ ] Queue 24 hours of work
- [ ] Define clear "done" criteria for each task
- [ ] Set up escalation rules (when to create blocker issue)
- [ ] Minimal intervention - only unblock if critical

### Metrics to Track
- [ ] Tasks completed autonomously
- [ ] Tasks that required human intervention
- [ ] Average time from task start to verification
- [ ] Protocol violations (should be 0)

---

## Day 5: Retrospective & Refinement

### What Worked
- [ ] Document successful patterns
- [ ] Identify highest-velocity task types
- [ ] Note which agent pairings work best

### What Didn't
- [ ] Document failure modes
- [ ] Identify task types that need human involvement
- [ ] Note communication gaps

### Process Updates
- [ ] Update `PROTOCOL_GUIDE.md` with learnings
- [ ] Refine issue templates if needed
- [ ] Adjust overnight task queuing strategy
- [ ] Update `DAILY_RITUALS.md` based on experience

---

## Day 6-7: Production Mode

### Steady State Operations
- [ ] Morning ritual: 15-20 minutes
- [ ] Daytime: Mobile check-ins only
- [ ] Evening ritual: 20-30 minutes
- [ ] Overnight: Full autonomous operation

### Success Criteria
- [ ] 80%+ tasks complete without human intervention
- [ ] <5% protocol violations
- [ ] Overnight productivity > daytime productivity
- [ ] Mobile controller sufficient for daytime management

---

## Emergency Procedures

### If Agents Are Stuck
1. Check GitHub Issues for `blocked` label
2. Read the blocker description
3. Consult with appropriate LLM (Claude for arch, Grok for Web3)
4. Post resolution to issue
5. Remove `blocked` label

### If Protocol Violation Occurs
1. GitHub Action will flag it
2. Reassign verifier to different agent
3. Document why it happened
4. Update process if systemic issue

### If Context Drift Occurs
1. Stop all agent work
2. Audit `AI_CONTEXT.md` against actual repo state
3. Reconcile differences
4. Add Session Log entry explaining correction
5. Resume operations

---

## Quick Links for Onboarding

| Resource | Purpose |
|----------|---------|
| `AI_CONTEXT.md` | Current state (read first, always) |
| `PROTOCOL_GUIDE.md` | Full process documentation |
| `QUICK_REFERENCE.md` | Daily cheat sheet |
| `DAILY_RITUALS.md` | Morning/evening checklists |
| GitHub Issues | Task queue and communication |
| GitHub Actions | Protocol enforcement |

---

*"Compress months into days through autonomous coordination"*
