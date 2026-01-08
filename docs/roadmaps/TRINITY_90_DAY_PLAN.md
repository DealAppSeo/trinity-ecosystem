# 90-Day Roadmap: Safe & Ethical AI Marketplace (Trinity)

> **Generated Strategy**: Based on `GEMINI_STRATEGY_PROMPT.md` and `STARTUP_DOCTRINE.md`.
> **Phase**: Pre-PMF -> Early PMF

## 🗓️ MONTH 1: The "Wedge" & Trust Spine (Pre-PMF)
**Focus**: Shipping the "Trust Infrastructure" so 10-30 Agents can run verifiably.

### Goals
1.  **Ship the Spine**: RepID Scoring v1 + Audit Log Format + Agent Manifest.
2.  **Dogfooding**: Convert 3 Portfolio Apps (AISocialMirror, AIDebate, etc.) to use RepID.
3.  **Wedge Launch**: "Safe Agent Execution" marketplace (Internal Alpha).

### Deliverables
- [ ] **Technical**: `MCPManager` with RepID middleware (Reject tool calls if RepID < X).
- [ ] **Artifacts**: Trust Cards for all 3 internal apps.
- **Metric**: 100 Verified Runs (Internal).

## 🗓️ MONTH 2: Verification & "The Squeeze" (Validation)
**Focus**: Proving value. "Does RepID make users trust us more?"

### Goals
1.  **Validation Loop**: 15 User Interviews/week (Prosumers). Use `PlaywrightMCP` to source candidates.
2.  **Experiment**: A/B Test "Trust Card" vs "No Card" on AIDebate.io.
3.  **Network**: Onboard 5 External "Evaluators" (Force Multipliers) to verify agents.

### Deliverables
- [ ] **Product**: Public Leaderboard ("Top Safe Agents").
- [ ] **Artifacts**: Weekly Execution Updates sent to 20 Partners.
- **Metric**: 30% WoW Growth in Verified Runs. dispute_rate < 1%.

## 🗓️ MONTH 3: Marketplace & Traction (Growth)
**Focus**: Opening the gates (carefully).

### Goals
1.  **Marketplace Beta**: Allow 3rd party creators to submit Agents via Manifest.
2.  **Consulting Wing**: Orchestrator Agents audit 50 startups/week to sell "RepID Integration" as a service.
3.  **Moat**: Publish "State of AI Trust" report using our aggregated Audit Logs.

### Deliverables
- [ ] **Product**: Self-serve "Get Verified" portal for creators.
- [ ] **Artifacts**: 10 Case Studies of "RepID Saved My Compliance".
- **Metric**: 1,000 Verified Runs/Week. $0 Lost to Fraud.

## 🚀 Immediate Action Items (Week 1)
1.  **Audit Portfolio**: Run `CONSULTING_AUDIT_PROMPT` on AISocialMirror, ImageBearer, etc.
2.  **Define RepID v1**: Code the scoring logic in `ConsumerAgent` or `Orchestrator`.
3.  **Ship Trust Cards**: Generate them for existing agents.
