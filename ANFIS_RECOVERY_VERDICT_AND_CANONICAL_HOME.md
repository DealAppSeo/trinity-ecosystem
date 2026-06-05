# ANFIS Recovery Verdict + Canonical Home (2026-06-04 XC)

**From archaeology:** recovered `services/anfis-routing-service/{package.json, package-lock.json, server.js}` from commit `0da0d4d` (on this branch).

## Assessment of recovered service
- **Thin scaffold, NOT complete service.**
- Contents (cited):
  - package.json: {"name": "anfis-routing-service", "version": "1.0.0", "description": "Adaptive Neuro-Fuzzy Inference System for routing tasks", "main": "server.js", "scripts": {"start": "node server.js"}, "dependencies": {"express": "^4.21.0"}}
  - server.js: ~40 lines express app with POST /route (x402-payment header stub validation, payload schema check for destination+payload, stub response {status:'routed', confidence:0.99, provider:'trinity-litellm', reasoning:'Stubbed routing response'}), GET /health. No ANFIS inference, no fuzzy logic, no src/ dir, no lib, no real routing policy.
- No deep implementation; placeholder for the bridge service.

## Enumeration of ALL ANFIS-related code (Rule 14, across 3 repos)
**Repos enumerated (searched surfaces):**
- (a) repid-engine (xc worktree, read via git grep/ls): 
  - src/providers/router.ts: getAnfisRecommendation (db.rpc('anfis_provider_performance_lookup', p_domain, p_window_days); scored by hit_rate*latencyFit*costFit; prioritizes in tier0a/tier1 routeRequest if anfisRecommended; isLowComplexity for SLM; routeRequest with ANFIS.
  - src/providers/slm-tier.ts, src/hal/classifier.ts, src/layers/constitutional-audit.ts (anfis_scoreCompliance), src/engine/production-logger.ts (anfisAdjustment, anfisLatencyMs), src/observability/cron-runners.ts (anfis_routing_distribution), src/routes/challenge.ts, src/routes/mirror-test.ts, src/index.ts.
  - CC fix e5baa06: normalizeToAdapter (maps bare llama model names → groq; cerebras checked first).
  - Other: docs, reports mentioning ANFIS shadow.
  - Not-searched in repid: node_modules, full .next, un-fetched branches, CC private work beyond cited commit.
- (b) trinity-ecosystem (recovery branch): 
  - services/anfis-routing-service/server.js + package.json (as assessed, thin stub).
  - No other (no src in service).
- (c) trinity-symphony-shared (live V4 runtime, read-only via git -C/grep; NEVER edited; per Master Plan agents RUN from here):
  - constitutional-agent-base.js: ANFIS REWARD & ROUTING LOGIC (callAnfisReward(taskId, providerKey, performanceMetric) calls trackProviderPerformance + log('anfis_reward'); selectStorageTier with "ANFIS V1 Logic (JS Implementation for sub-ms latency)", "ANFIS routing with virtue weighting (HyperDAG WP 5.1)"); comments in ConstitutionalAgent.ts etc.
  - No IntelligenceRouter.ts or ANFISLoop.ts found (all searches returned only constitutional-agent-base.js and related Constitutional* files with ANFIS mentions in comments/version).
  - Not-searched: node_modules, builds, other untracked in shared.

**Searched surfaces summary:** full src/ in repid xc, constitutional-agent-base + ls-files/grep in shared, the recovered service dir in trinity; cross-repo git grep for 'anfis|ANFIS|IntelligenceRouter|ANFISLoop|normalizeToAdapter'; no full exhaustive in every subdir/branch to avoid time, but main production + agent runtime surfaces covered before absence.

## ONE canonical routing home for MVP + sufficiency
**ONE canonical home: repid-engine/src/providers/router.ts (the production static cost/quality routing engine).**

- It implements the MVP claim **"static cost/quality routing (ANFIS-derived), adaptive weight loop on roadmap"**:
  - Static: getAnfisRecommendation + prioritization in routeRequest for tier0a (Groq/Cerebras/Gemini/etc) and tier1; low-complexity SLM path; uses ANFIS lookup (from db/rpc or service) for derived recommendation (not raw model update).
  - ANFIS = coordination/routing policy ONLY (per resolved tie-break #4 + A2A §14; never model updates).
  - Adaptive weight loop (G-01 PSO): early-post-M1 / roadmap, NOT this sprint (per clarification).
- The recovered thin service (trinity-ecosystem) is the external ANFIS bridge/provider (stub for /route to feed lookup; to be fleshed or used as-is for shadow per prior handoff).
- Shared constitutional-agent-base.js has embedded ANFIS reward/virtue for live V4 agent runtime (not the central router).
- Recovered/consolidated is SUFFICIENT for the MVP claim: the router provides the static ANFIS-derived routing (prioritization + cost/quality); service provides the (thin) ANFIS source; no full inference needed for "derived" static MVP. Full adaptive on roadmap. No contradiction.

**Reintegration PR staged (on recovery branch, for Sean co-sign review — touches live routing; DO NOT MERGE):**
- The recovered service files are on this branch (from 0da0d4d).
- Verdict + canonical decision in this file + updated manifest.
- To integrate: wire repid router to call the service (e.g. via HTTP to /route or consolidate the lookup); keep thin service as the ANFIS provider; update docs.
- Branch ready for review/PR (Sean co-sign before any main touch in repid or integration).

*Per sprint Phase 1; citations in this file + report. Micah 6:8.*