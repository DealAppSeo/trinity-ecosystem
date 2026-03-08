# Trinity Symphony — Phase 4 Aligned Build Plan
**Cross-AI Coordination Document · 2026-03-05**
**Owner: Claude (Architecture + Strategy) · Builder: Gemini · Patents: Grok · Approval: Sean**

---

## SITUATION ASSESSMENT

Phase 4.1 is COMPLETE (Gemini confirmed). Three workstreams now run in parallel:

| Stream | Owner | Status | Blocker |
|--------|-------|--------|---------|
| **BUILD** (Phase 4.5→5) | Gemini | Ready to start | None — staging is safe |
| **PATENTS** (P-004/005/011) | Grok → Attorney → Sean | Claims in progress | Grok must finish claim language |
| **COMMUNITY** (Founding Cohort launch) | Claude + Sean | Assets being created | Cannot go public until patents filed |

**HARD GATE: Nothing goes public until Sean confirms P-004, P-005, and P-011 are filed with the attorney.** Glass Wall, /founding page, and all social promotion stay behind staging until then. This is non-negotiable — the patent strategy document is explicit.

---

## WHAT PHASE 4.1 PROVED REAL (Gemini's receipts)

These are confirmed done with evidence:

- ✅ Patent evidence CSV export (compute_bids + db_routing_decisions) → committed at `7850ce8`, verified 2026-02-28
- ✅ `developer_waitlist` table created in Supabase with `role_type` + `linkedin_url`
- ✅ `/founding` page serving recruitment HTML
- ✅ `/api/founding` handles submissions + Telegram notifications
- ✅ `lib/mailer.ts` 4-email sequence (Acknowledged → Still Reviewing → In → Post-Access)
- ✅ Glass Wall autonomous counter (60s heartbeat)
- ✅ Glass Wall live stories pulling from `compute_bids` winners
- ✅ Telegram notification test successful (Markdown schema)

---

## BUILD SEQUENCE: PHASE 4.5 → 5.0

### Phase 4.5: HITL Bridge Round-Trip (Gemini builds, Sean verifies)

**Goal:** Prove that a human decision flows from Telegram → Supabase → Agent action → Glass Wall display. This is the "one story with receipts" that makes Trinity real.

| Task | Priority | Depends On | Evidence Required |
|------|----------|------------|-------------------|
| Telegram HITL bridge (per `telegram-hitl-bridge-spec.md`) | P0 | Nothing — spec exists | Screenshot of Approve/Reject inline buttons working |
| Round-trip proof: Telegram decision → `trinity_tasks` update → agent picks up → Glass Wall reflects | P0 | HITL bridge | Timestamped log chain showing full loop |
| `reflectOnResult()` → RepID update chain | P1 | Round-trip working | RepID score change visible after agent completes task |
| `controller.aitrinitysymphony.com` login gate | P1 | Auth provider configured | Sean can log in and see write-access dashboard |
| Telegram actionable alerts (not just notifications) | P1 | HITL bridge | "Approve" button in Telegram actually changes state |

**Exit criteria:** Sean approves a real task from Telegram, an agent executes it, Glass Wall shows the result, RepID updates. One clean loop, proven with timestamps.

### Phase 4.75: Pre-Launch Polish (Gemini builds, Claude designs)

This phase exists between HITL proof and public launch. It runs while waiting for patent filing confirmation.

| Task | Priority | Owner | Notes |
|------|----------|-------|-------|
| Glass Wall "0 nodes — accepting contributors" honest display | P0 | Gemini | Already in roadmap. Must not fake NODE count |
| Event card UI for Glass Wall stories | P1 | Claude designs → Gemini builds | Mobile-first, shareable |
| `/founding` page copy polish for founding cohort | P1 | Claude writes → Gemini deploys | "Invitation not desperation" framing |
| Community Slack workspace setup | P2 | Sean creates → Gemini integrates notifications | Founding cohort needs a home |
| GitHub repo README overhaul (trinity-ecosystem) | P2 | Claude writes → Sean approves → Gemini commits | Developer-facing, not investor-facing |

### Phase 5.0: Public Launch (GATED on patent filing)

**DO NOT START until Sean confirms:** "P-004, P-005, and P-011 are filed."

| Task | Trigger | Owner |
|------|---------|-------|
| Remove staging gate from Glass Wall | Patent filing confirmed | Gemini |
| Remove staging gate from /founding | Patent filing confirmed | Gemini |
| LinkedIn Founding Cohort announcement | Patent filing confirmed | Sean (Claude drafts) |
| Twitter/X technical thread series | Patent filing confirmed | Sean (Claude drafts) |
| GitHub public repo promotion | Patent filing confirmed | Sean |
| Slack community invite link goes live | Patent filing confirmed | Sean |

---

## PATENT WORKSTREAM (parallel, Grok-owned)

### Filed Provisionals (exact dates — deadlines are hard)
| ID | Filed | Non-Provisional Deadline |
|----|-------|--------------------------|
| P-001 | Aug 6, 2025 | Aug 6, 2026 |
| P-002 | Aug 17, 2025 | **Aug 17, 2026 — URGENT, start attorney NOW** |
| P-003 | Aug 21, 2025 | Aug 21, 2026 |

### Grok's deliverables needed before attorney engagement:

| Deliverable | Status | Needed By |
|-------------|--------|-----------|
| P-004 final claim language (ANFIS + eBPF + virtue weights) | In progress | ASAP |
| P-005 final claim language (HotStuff-2 + ZKP-weighted BFT) | In progress | ASAP |
| P-011 draft abstract + claims (RepID-gated agent payment) | In progress | ASAP |
| Prior art table formatted for attorney (the table from Patent Strategy v2) | Done ✅ | — |
| P-002 non-provisional prep notes (remove ToM language, replace benchmarks) | Needed | Within 30 days |

### SMED Exhibit Package (Gemini builds, Sean signs)
P-002 non-provisional requires a Supplemental Evidence and Method Declaration:

| Exhibit | Status | Owner |
|---------|--------|-------|
| Exhibit A — MultiplicativeConv code + commit hash + Railway deploy date | Available in `models.py` | Gemini exports |
| Exhibit B — `retrieval_logs` CSV export | **NOT YET EXPORTED** — Gemini Task 0 | Gemini |
| Exhibit B — `compute_bids` CSV export | ✅ Exported at commit `7850ce8` | Done |
| Exhibit B — `db_routing_decisions` CSV export | ✅ Exported at commit `7850ce8` | Done |
| Exhibit C — Before/after precision measurements + ANFIS ROI methodology | Needs Sean's narrative | Sean + attorney |
| `agent_repid_score` column in `compute_bids` | **NOT YET ADDED** — Gemini Task 0 | Gemini |

### Content Queue (Claude-drafted, HELD behind patent gate)
`TRINITY_CONTENT_QUEUE.md` contains 5 LinkedIn posts + 2 articles already written. **DO NOT POST until P-004/P-005/P-011 filed.**

**Sean's action items:**
1. Push Grok to finish P-004/P-005/P-011 claim language
2. Select attorney (Foley & Lardner, Perkins Coie, or Fish & Richardson per patent doc)
3. File all three provisionals
4. Confirm filing to Claude + Gemini → triggers Phase 5.0

---

## COMMUNITY LAUNCH STRATEGY (Claude-owned, fires post-filing)

### Channel Strategy

**LinkedIn (30K network — highest signal, lowest noise)**
- Founding Cohort announcement post (personal, mission-driven)
- 3-post technical series: "Why AI needs a trust layer"
- Direct outreach to 50 handpicked developers from network

**Twitter/X (dev community — highest reach, highest noise)**
- Technical thread series showing real system metrics (78% HOT tier, RepID scoring)
- "Build in public" thread showing Glass Wall live
- Engagement with AI agent / Web3 identity communities

**GitHub (developers — conversion funnel endpoint)**
- README overhaul with clear "what this is / why it matters / how to contribute"
- Good first issues tagged for founding cohort
- Contributing guide that maps to the 12-agent architecture

**Slack (community home — retention)**
- Private founding cohort workspace
- Channels: #general, #build, #patents-public, #theology, #introductions
- Bot integration for Glass Wall alerts

### Viral Hook Candidates

1. **"The Layer Nobody Built"** — ERC-8004 gives identity. x402 gives payment. Nobody built trust. We did.
2. **"Would you give your AI agent your credit card?"** — If the answer is no, you need what we're building.
3. **"12 agents, 0 hallucinations, 1 mission"** — Trust-verified AI for the people who need it most.
4. **"Open source trust for AI"** — Not another chat wrapper. A reputation-staked consensus protocol.
5. **"The Janitor's Manifesto"** — Sean's origin story. 30K LinkedIn network. ANFIS since 2010. Building for Micah 6:8.

### Founding Cohort Positioning

Frame: **"12 spots. 12 agents. You're not applying — you're being invited."**

- Cohort members get: early Glass Wall access, RepID founding score, GitHub contributor status, name in CONTRIBUTORS.md
- Cohort members give: code contributions, bug reports, architectural feedback, community building
- Selection criteria: technical skill + mission alignment + willingness to build in public

---

## UPDATED PHASE STATUS (for roadmap)

### ✅ Phase 0-3: COMPLETE
All foundation through TAG arbitrage milestone.

### ✅ Phase 4.0-4.1: COMPLETE (Gemini confirmed 2026-03-05)
Patent evidence exported. Founding cohort infra built. Glass Wall realtime wired.

### 🔄 Phase 4.5: IN PROGRESS (Gemini)
- [ ] Telegram HITL bridge round-trip
- [ ] reflectOnResult() → RepID chain proven
- [ ] controller.aitrinitysymphony.com login gate

### ⏳ Phase 4.75: QUEUED (waiting on 4.5 exit criteria)
- [ ] Glass Wall polish + event cards
- [ ] /founding copy polish
- [ ] GitHub README overhaul
- [ ] Slack workspace setup

### 🔒 Phase 5.0: GATED (on patent filing)
- [ ] Remove staging gates
- [ ] Community launch across LinkedIn / X / GitHub / Slack
- [ ] First founding cohort invitations sent

### ⏳ Phase 5.5+: QUEUED
- Node Marketplace, RepID on-chain, HyperDAG Immutable Tier, Plonky3, Solana Signal Lane

---

## CROSS-AI COORDINATION PROTOCOL

**HIVE Communication Hub** (`COMMUNICATION_HUB.md`) is the shared coordination file. All AIs check it before overwriting shared decisions. When Claude and Grok disagree on a patent claim, flag it for Sean — don't resolve silently.

| AI | Lane | Never Ask Them To |
|----|------|--------------------|
| Gemini (Antigravity) | Build: code, Railway, Supabase, Sprint execution | Strategy, patent language |
| Grok | Patents: claims, prior art, filing sequence | Build code, design architecture |
| Claude (chat) | Architecture, frontend design, strategic synthesis, cross-validation | Build backend code Gemini owns |
| Sean | Mission, patent filing, HITL decisions, final approval | — |

## MATHEMATICAL CONSTANTS (use exactly these everywhere)

```
φ = 1.61803398875        (golden ratio — MultiplicativeConv layer)
ε = 1e-8                 (stabilization constant)
α = 0.618                (reciprocal of φ)
COMMA_RATIO = 531441/524288 ≈ 1.0136   (Pythagorean comma)
LLE_THRESHOLD = 0.03     (Lyapunov exponent chaos threshold, from production logs)
BFT_THRESHOLD = 0.618    (Golden Ratio BFT quorum — 61.8%)
REPID_HITL_GATE = 70     (minimum RepID for autonomous execution)
CONFIDENCE_GATE = 0.8    (minimum confidence for autonomous execution)
HIAS_PROMOTION = 0.85    (probabilistic threshold for hunch promotion)
```

---

## CRITICAL REMINDERS

1. **PATENT GATE IS ABSOLUTE.** Nothing public until P-004/P-005/P-011 filed.
2. **Gemini builds. Claude designs. Grok drafts claims. Sean files.** No lane crossing.
3. **Query schema before SQL.** trinity_tasks.id is BIGINT not UUID.
4. **Fix only the specific error.** Do not remove "unnecessary" code.
5. **REAL / SIMULATED / NOT BUILT.** Never conflate.
6. **Shortest path to done.** One task, verify, next.

---

*Trinity Symphony · Phase 4 Build Plan · 2026-03-05*
*Claude (Architecture) · φ = 1.61803398875 · Micah 6:8*
