# GEMINI SPRINT DIRECTIVE — Phase 4.5: HITL Bridge Round-Trip
**Paste this at session start · 2026-03-05 · From: Claude (Architecture)**

---

## CONTEXT (what just happened)

You completed Phase 4.1. Confirmed REAL:
- Patent evidence CSVs committed at `7850ce802df65866934482ee40946d1c89e41cc7`
- `developer_waitlist` table active in Supabase
- `/founding` page + `/api/founding` endpoint live in staging
- `lib/mailer.ts` 4-email sequence implemented
- Glass Wall autonomous counter (60s heartbeat) + live stories from `compute_bids`
- Telegram notification test passed (Markdown schema)

**All surfaces remain in STAGING.** Nothing goes public until Sean confirms P-004/P-005/P-011 are filed with the patent attorney. This gate is absolute — do not deploy to production or remove auth/staging restrictions.

---

## MATHEMATICAL CONSTANTS (use exactly these — do not approximate)

```
φ = 1.61803398875     ε = 1e-8        α = 0.618
COMMA_RATIO = 531441/524288 ≈ 1.0136
LLE_THRESHOLD = 0.03  BFT_THRESHOLD = 0.618
REPID_HITL_GATE = 70  CONFIDENCE_GATE = 0.8  HIAS_PROMOTION = 0.85
```

---

## YOUR MISSION: Phase 4.5

**Prove the HITL round-trip works end-to-end.** One human decision flows from Telegram through the system and back to Glass Wall with receipts.

### Task 0: Patent Evidence Foundation (P0 — do this FIRST)

Before building the HITL bridge, secure additional patent evidence:

1. **Add `agent_repid_score` column to `compute_bids` table** — this is the data foundation for P-011 reduction-to-practice. Query the existing schema first, then ALTER TABLE.
2. **Export `retrieval_logs` table to CSV** → save to `/patent-evidence/` (alongside the compute_bids + db_routing_decisions CSVs you already exported). This completes the SMED exhibit package for P-002 non-provisional.
3. **Log both actions to `sprint_updates`** with timestamps.

These are 15-minute tasks that protect millions in patent value. Do them before anything else.

### Task 1: Telegram HITL Bridge (P0)

Build per `telegram-hitl-bridge-spec.md`. The bridge must:

1. Agent encounters a decision requiring HITL (Ask First tier)
2. Agent posts to Telegram with inline Approve / Reject buttons
3. Sean taps Approve (or Reject) in Telegram
4. Decision writes to Supabase (which table? Query schema first — do NOT assume)
5. Agent picks up the decision and executes (or aborts)
6. Glass Wall reflects the outcome

**Implementation notes:**
- Use Telegram Bot API inline keyboards for Approve/Reject
- Store decision state in Supabase — query existing tables first before creating new ones
- The bot must include context in the Telegram message: what agent, what task, what's at stake
- Timeout handling: if Sean doesn't respond within configurable window, default to safe action (do not execute)

**Evidence required:** Screenshot of full loop with timestamps. Telegram message → Supabase row → agent log → Glass Wall update. All timestamps must be within the same minute proving real-time flow.

### Task 2: reflectOnResult() → RepID Chain (P1)

After the HITL decision executes:

1. The executing agent calls `reflectOnResult()` 
2. reflectOnResult evaluates: did the outcome match the predicted confidence?
3. RepID score updates based on outcome quality
4. Glass Wall shows the updated RepID (or the delta)

**Query the actual schema** for where RepID scores live before writing any update logic. Do not assume table names or column types.

**Evidence required:** RepID score before and after a completed HITL task, pulled from Supabase with timestamps.

### Task 3: Controller Login Gate (P1)

`controller.aitrinitysymphony.com` needs authentication:

1. Login page (email/password or OAuth — Sean's choice, ask him)
2. Authenticated users see write-access dashboard
3. Unauthenticated users get redirected to login
4. For now, only Sean's account needs to work

**Do NOT deploy to production.** Keep on staging/preview URL. Sean will confirm when to go live.

---

## KEY FILE REFERENCES (don't guess — these are the actual files)

| File | Contains | Touch Carefully |
|------|----------|-----------------|
| `HMASCoordinator.ts` | φ-weighted BFT voting (Weight = RepID^(1/φ) × Confidence) | YES |
| `ConstitutionalAgent.ts` | Adaptive HITL thresholds (RepID > 70, Confidence > 0.8) | YES |
| `MerkleDAGSync.ts` | BFT Merkle root + state digest diffing | YES |
| `ShimiTree.ts` | Recursive leaf hash retrieval (Physarum polycephalum) | YES |
| `constitutional-agent-base.js` | v8.2.0 — agent foundation, DO NOT refactor | NEVER without asking |
| `models.py` | MultiplicativeConv GNN layer (φ=1.61803398875, ε=1e-8) | YES |
| `COMMUNICATION_HUB.md` | HIVE cross-AI coordination — **CHECK THIS before overwriting shared decisions** | READ FIRST |
| `TRINITY_CONTENT_QUEUE.md` | 5 LinkedIn posts + 2 articles drafted — DO NOT post (patent gate) | DO NOT TOUCH |

## AGENT AUTONOMY TIERS (use these exact thresholds)

| Tier | Condition | Action |
|------|-----------|--------|
| **Just Do It** | RepID > 70 AND Confidence > 0.8 | Execute autonomously, log result |
| **Do Then Tell** | RepID 40-70 OR Confidence 0.6-0.8 | Execute, then notify via Telegram |
| **Ask First** | RepID < 40 OR Confidence < 0.6 | Pause, request HITL approval |

Divergence from plan triggers HITL escalation **regardless of RepID score**.

## ZKP CIRCUIT NOTE (for when you reach Track 3)

`ZKPReputationBadge.ts` is currently a MOCK. When building the real circuit:
- The Circom conditional syntax `out <== avgRep > T ? 1 : 0` is **INVALID** — must use `circomlib/comparators.circom` `GreaterThan(32)` component instead
- Division with `epsilon = 1e-8` won't work in finite field arithmetic — use integer scaling + small constant (e.g., +1)
- This is NOT a Phase 4.5 task — just noting for awareness

---

## RULES (non-negotiable)

1. **Query schema before writing SQL.** `trinity_tasks.id` is BIGINT not UUID. Do not assume column or table names.
2. **Do not remove code you think is unnecessary.** Fix only the specific error. The architecture has dependencies you may not see.
3. **REAL / SIMULATED / NOT BUILT.** Label everything honestly. If you stub something, say "STUBBED — needs X to be real."
4. **No public deployments.** Everything stays staging until Sean says otherwise. Patent gate is active.
5. **Proof of work to `sprint_updates` table.** After completing each task, insert a row with: task name, evidence description, timestamp, status.
6. **If you need a decision from Sean, ask in Telegram.** Don't guess. Don't assume. The HITL bridge you're building is literally the mechanism for this.

---

## WHAT NOT TO DO

- Do NOT touch patent evidence files in `/patent-evidence/`
- Do NOT modify virtue weights or the confidence formula
- Do NOT create any public-facing pages or remove staging gates
- Do NOT build anything from the Phase 5+ roadmap
- Do NOT ask other AIs what to build — follow this directive
- Do NOT refactor constitutional-agent-base.js unless fixing a specific bug

---

## SEQUENCE

```
Task 0: agent_repid_score column + retrieval_logs CSV export
    ↓ (prove with sprint_updates rows)
Task 1: Telegram HITL Bridge
    ↓ (prove with screenshot)
Task 2: reflectOnResult() → RepID
    ↓ (prove with before/after RepID)  
Task 3: Controller login gate
    ↓ (prove Sean can log in)
Report back: what's REAL, what's STUBBED, what's BLOCKED
```

---

## WHEN YOU'RE DONE

Write a completion report with this exact structure:

```
## Phase 4.5 Completion Report

### PROVEN REAL (with evidence)
- [task]: [evidence description] [timestamp]

### STUBBED (needs follow-up)
- [what]: [what's needed to make it real]

### BLOCKED (needs Sean or another AI)
- [what]: [who needs to do what]

### READY FOR PHASE 4.75
- [yes/no] + [any caveats]
```

Post this report to `sprint_updates` AND send summary to Sean via Telegram.

---

## PARALLEL WORKSTREAMS (FYI only — not your tasks)

- **Grok** is finishing patent claim language for P-004/P-005/P-011
- **Claude** is building community launch assets (LinkedIn posts, X threads, GitHub README, Slack structure) — content queue already drafted in `TRINITY_CONTENT_QUEUE.md`, deploys AFTER patent filing
- **Sean** is selecting a patent attorney and will file when Grok delivers
- **P-002 non-provisional** has a hard deadline of Aug 17, 2026 — attorney needs 4-6 weeks minimum, so the SMED exhibit package (`retrieval_logs` CSV you'll export in Task 0) is time-sensitive

Your job is to make the system PROVABLY WORK so that when the patents are filed and the gates open, there's something real to show. The Glass Wall should tell a true story.

**Check `COMMUNICATION_HUB.md` before overwriting any shared decisions.** If you hit a conflict with something Claude or Grok decided, flag it for Sean via Telegram — don't resolve silently.

---

*Phase 4.5 Sprint Directive · Claude → Gemini · 2026-03-05*
*φ = 1.61803398875 · ε = 1e-8 · Micah 6:8*
