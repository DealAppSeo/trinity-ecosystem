# AI_CONTEXT.md - Trinity Symphony Cross-Agent Coordination

> **Last Updated:** 2026-02-13 by Sean
> **Current Phase:** Phase 0 (Week 1)
> **Sprint Goal:** PWA skeleton + EIP-8004 foundation + Shadow RepID

---

## 🎯 Quick Start for AI Agents

**Read this file first.** It contains the current state of the project and your assigned tasks.

### Project Identity
- **Name:** Trinity Symphony v2.0
- **Mission:** Democratize AI for "the last, the lost, and the least"
- **Core Principle:** Efficiency over engagement
- **Ethics Filter:** Philippians 4:8 (hardcoded, interpretation evolves)

### Repositories
| Repo | Visibility | Purpose |
|------|------------|---------|
| `trinity-ecosystem` | Private | Core infrastructure, gateway, py-brain |
| `trinity-symphony-shared` | Public | Workers, agents, shared utilities |

### Infrastructure
| Service | URL/Location | Purpose |
|---------|--------------|---------|
| Supabase (Trinity) | `qnnpjhlxljtqyigedwkb.supabase.co` | Agent coordination, RepID tracking |
| Railway | 8 agents deployed | HDM, APM, MEL, VERITAS, NEXUS, ANTIGRAV, GCM, TORCH |
| Base Sepolia | TBD (deploying Week 1) | EIP-8004 registries testnet |

---

## 🏗️ Architecture Summary

### Agent Structure (3x3+3)
```
ORCHESTRATION LAYER:
├── ORCH (Claude) - Routing decisions
├── W3C (Grok) - Dispute detection
└── SHOFET (Gemini) - Judicial resolution

ALPHA SQUAD (Truth):
├── TORCH - Content generation
├── VERITAS - Ethics verification
└── GCM - Governance

BETA SQUAD (Care):
├── CHESED - Compassion/support
├── MEL - Management
└── APM - Prompt engineering

GAMMA SQUAD (Build):
├── SOPHIA - Code generation
├── NEXUS - Integration
└── HDM - Infrastructure
```

### Heterogeneous LLM Protocol
**Rule:** Verifying agent MUST use different LLM than authoring agent.

| Task | Author | Verifier |
|------|--------|----------|
| EIP-8004 registries | Grok | Claude |
| PWA skeleton | Gemini | Grok |
| ANFIS routing | Claude | Gemini |
| Shadow RepID | Claude | Grok |

---

## 📋 Current Sprint Status

### Phase 0 Week 1 Tasks

| Task | Owner | Status | Verified By | Notes |
|------|-------|--------|-------------|-------|
| PWA skeleton (<5MB, voice-first) | Gemini | ✅ DONE | Pending Grok | VoiceInput.tsx complete, needs bundle size check |
| EIP-8004 registries (Base Sepolia) | Grok | 🔄 IN PROGRESS | Pending Claude | - |
| ANFIS routing baseline | Claude | ⏳ NOT STARTED | Pending Gemini | - |
| Shadow RepID (Supabase) | Claude | ⏳ NOT STARTED | Pending Grok | - |

### Blockers
- None currently

### Decisions Made This Sprint
1. EIP-8004: Full Adoption (Option A)
2. Ethics: Core unbreakable, interpretation evolves (Option B)
3. Beta: Shadow Mode Week 2 → Real Beta Week 4 (Option C)
4. IP: Hybrid model (Option C)
5. BYOK: Enabled with Silver (1.5x) / Gold (2.0x) multipliers

---

## 🔑 Key Technical Decisions

### RepID Tiers
| Tier | Range | Key Unlocks |
|------|-------|-------------|
| Seedling | 0-999 | 50 calls/day, 5GB/month |
| Sapling | 1,000-2,499 | Referral capability |
| Tree | 2,500-4,999 | Verification rights |
| Grove | 5,000-7,499 | DAO voting |
| Forest | 7,500-9,999 | Agent creation |
| Canopy | 10,000 | Full governance |

### Privacy Triggers
- Pedersen Commitments: Delta > 500 OR Tier Crossing

### BYOK "Fuel the Symphony"
- Silver (BYOK only): 1.5x RepID, 2x rate limits
- Gold (BYOK + 100 HDG stake): 2.0x RepID, DAO boost
- Minimum period: 30 days before multiplier activates
- Day 1 providers: OpenAI, Anthropic, Groq, Google

### Platform Stack
- L2: Base (Coinbase)
- Micro-ops: IOTA (free heartbeats)
- UX: PWA-first (Next.js + next-pwa)
- Languages Day 1: English, Spanish

---

## 📁 Key Files Reference

### trinity-ecosystem (Private)
```
/gateway/
├── anfis-router.ts      # Intelligent routing (Claude owns)
├── byok-manager.ts      # BYOK key management (Week 2)
└── websocket-server.ts  # Agent orchestration

/py-brain/
├── anfis_core.py        # ANFIS implementation
└── gnn_hybrid.py        # Phase 2 GNN layer
```

### trinity-symphony-shared (Public)
```
/workers/
├── trinity-worker.js    # EIP-8004 registration
└── ConstitutionalAgent.ts # Heterogeneous LLM enforcement

/pwa/
├── VoiceInput.tsx       # Voice-first UI (Gemini completed)
└── manifest.json        # PWA config
```

### Supabase Schema (Shadow Mode)
```sql
-- Core tables for Phase 0
trinity_tasks (id BIGINT, not UUID)
agent_registry
repid_shadow_tracking (NEW - Week 1)
user_contributions (NEW - Week 2, BYOK)
```

---

## 🚦 Shadow Mode Success Gates

| Metric | Week 2 Target | Week 4 Gate |
|--------|---------------|-------------|
| Task Completion | 70% | 95% |
| SHOFET Escalation | <20% | <5% |
| Voice Recognition (EN/ES) | 70% | 85% |
| PWA Load Time (3G) | <8s | <3s |
| RepID Sync Accuracy | ±10% | ±2% |

---

## 🔄 Handoff Protocol

When passing work between agents, use this format:

```markdown
## Handoff: [From Agent] → [To Agent]
**Date:** YYYY-MM-DD
**Task:** [Clear description]
**Files Changed:** [List]
**Context:** [Why this matters]
**Acceptance Criteria:** [How to verify done]
**Blockers/Risks:** [What might go wrong]
```

---

## 📝 Session Log

### 2026-02-13 (Gemini)
- ✅ Completed PWA skeleton
- ✅ Implemented VoiceInput.tsx with Web Speech API
- ✅ Generated PWA icons (192, 512)
- ⚠️ Pending: Bundle size verification (<5MB target)

### 2026-02-13 (Claude)
- ✅ Reviewed EIP-8004 integration plan
- ✅ Confirmed all strategic decisions (A, B, C, C)
- ✅ Defined BYOK rewards structure
- ⏳ Next: ANFIS routing baseline + Shadow RepID schema

### 2026-02-13 (Grok)
- 🔄 Working on: EIP-8004 registry deployment to Base Sepolia
- ⏳ Next: Verify Gemini's PWA work

---

## ⚠️ Critical Rules (All Agents Must Follow)

1. **DO NOT ASSUME** column names or table structures. Query actual schema first.
2. **DO NOT SIMPLIFY** or remove code without asking. Fix only the specific error.
3. **NEVER put instructions inside code blocks.** Only executable code/SQL.
4. **VERIFY before claiming done.** Run the code, check the output.
5. **HETEROGENEOUS PROTOCOL:** Always verify using different LLM than author.
6. **EFFICIENCY OVER ENGAGEMENT:** Shortest path to done. No busywork.

---

## 🔗 Quick Links

- [EIP-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [8004.org Build Guide](https://www.8004.org/build)
- [Trinity Supabase Dashboard](https://supabase.com/dashboard/project/qnnpjhlxljtqyigedwkb)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

---

## 📞 Human Escalation

If blocked or uncertain, escalate to Sean with:
1. What you tried
2. What failed
3. What you need to proceed

**Sean's principles:**
- "Janitor for Jesus" - serving others through tech
- "Nerd for Jesus" - technical excellence for Kingdom impact
- Golden Rule applies to AI interactions too
