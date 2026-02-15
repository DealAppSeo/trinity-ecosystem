# AI_CONTEXT.md - Trinity Symphony Source of Truth 🌐

> **Last Updated:** 2026-02-15 10:45 AM
> **Sync Status:** 🟢 Local-First Synchronized

## 🎯 Active Phase: 0.3 - MCP Layer & Intelligent Routing
**Primary Goal:** Implement ANFIS-based tool routing and GitHub MCP integration to optimize agent token usage.

### 🤖 Agent Coordination Board

| Agent | Module | Status | Recent Activity |
|-------|--------|--------|-----------------|
| **TORCH** | Ethics/Constitutional | 🟢 Active | Stabilizing Phil 4:8 guardrail stubs |
| **VERITAS** | ZKP/Verification | 🟡 Idle | Awaiting circuit audit for RepID Phase 1 |
| **SOPHIA** | Knowledge/Learning | 🟢 Active | Training initial ANFIS routing logic |
| **NEXUS** | Orchestration/MCP | 🔵 Preparing | Configuring GitHub MCP server toolsets |

### 🛠 MCP Infrastructure Health

| Server | Role | Status | Path |
|--------|------|--------|------|
| **github** | Repo Management | 🟢 Active | official:github-mcp-server |
| **supabase** | Persistence | 🟢 Active | @supabase/mcp-server |
| **trinity-orch**| Routing | 🟡 Initializing | ./packages/mcp-servers/orchestrator |
| **trinity-repid**| Reputation | 🔘 Planned | ./packages/mcp-servers/repid |

## 📐 Architecture Decisions (ADRs)

### ADR-001: ANFIS + LASSO for Routing
- **Decision:** Use Adaptive Neuro-Fuzzy Inference System (ANFIS) for tool selection, regulated by LASSO (L1 penalty) to minimize token consumption.
- **Rationale:** Standard LLM tool selection is often redundant and expensive; ANFIS provides interpretable, efficient routing.

### ADR-002: Dual-Repo Communication
- **Decision:** Use GitHub Issues and `AI_CONTEXT.md` as the primary async communication bridge between protocol and platform layers.
- **Rationale:** Ensures auditability and transparency for both human maintainers and agents.

## 🛡️ Quantum Readiness (Phase 0.4)

Trinity Symphony is evolving toward a post-quantum (PQ) secure state using hybrid architectures.

- **Vault Mode:** Hybrid (Kyber-512 + AES-GCM-256)
- **Signature Path:** Hybrid (ECDSA + ML-DSA-65 Frame Stubs)
- **PQ Status:** 🟡 Transitioning (Software-Level PQ Enabled)
- **Last PQ Audit:** 2026-02-15

## 📊 Routing & Swarm Metrics

| Metric | Current Value | Target (Sprint End) |
|-------|---------------|---------------------|
| Tool Spark (Token Savings) | 94.2% | >92.0% |
| Avg ANFIS Confidence | 0.88 | >0.85 |
| Tools/Query (Saver Mode) | 6.2 | <8.0 |
| PQ Verified tx% | 12.0% | 100% (Phase 1.0) |

## 📜 Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.4.0 | 2026-02-15 | VERITAS | Implemented QuantumVault & PQ Contract Stubs |
| 0.3.5 | 2026-02-15 | NEXUS | LLM-Lasso Hybrid Router with heuristic fallback |
| 0.3.1 | 2026-02-15 | NEXUS | Added MCP server health monitoring |
| 0.3.0 | 2026-02-15 | SOPHIA | Initial real ANFIS layer implementation |
| 0.2.5 | 2026-02-14 | TORCH | Ethics guardrail stubs completed |
| 0.2.0 | 2026-02-13 | Gemini | EIP-8004 foundations implemented |

---

## 🔄 Sync Protocol

This file is the authoritative source of truth and is synchronized across all ecosystem repositories:

1. **On Push to `main`**: Syncs to all Trinity repos within 5 minutes via GitHub Actions.
2. **Manual Trigger**: Run `gh workflow run sync-ai-context.yml` from the root.
3. **Conflict Resolution**: Latest timestamp wins; conflicts are logged to `#trinity-sync` for human/agent review.

```bash
# Manual sync command for agents
npx @trinity-symphony/cli sync-context --all
```

---
*Grounded in Honor, Justice, and Truth. Grounded in Micah 6:8.*
