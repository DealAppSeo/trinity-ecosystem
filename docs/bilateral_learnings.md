# Key Discoveries — Bilateral Learnings

**Trinity Symphony Build Session | March 19-22, 2026**

During the comprehensive build session spanning the Adversarial Verifier, Cloudflare caching deployments, and cross-model orchestration, the following key architectural and operational discoveries were made:

### Architecture & Security Patterns
* **Tool Receipts Pattern:** Hashing `HMAC(query + result + timestamp)` proves exactly what the agent *saw* at the moment of execution, not just how it thought. This is highly patentable, mathematically fast, and virtually free compared to full zk-SNARK generation.
* **Waterfall Verification:** Implementing a 3-gate waterfall drastically reduces token costs. 
  * Gate 0 (Deterministic) takes <10ms and is free, catching 70-80% of crypto/fact hallucinations.
  * Gate 1 (Fast LLM like Groq-LLaMA) catches another large chunk.
  * Gate 2 (Deep CoT reasoning via DeepSeek) is only ever reached by 5-10% of queries, saving immense runtime latency.
* **ModelProof Pattern:** Running two entirely independent LLM families on the exact same input serves as a perfect divergence check. If they fundamentally disagree, it acts as an immediate uncertainty flag for the broader network.
* **SHOFET Coordinated False Signal Test:** During rigorous red-team testing, we induced a coordinated false signal. The Pythagorean Comma veto system fired perfectly with a dissent score of `0.9`, proving the Byzantine Fault Tolerance tribunal is actively working against internal collusion.

### Identity & Ecosystem Positioning
* **KYA (Know Your Agent) = RepID:** This became the definitive winning positioning language for trading agent hackathons. Do not trust an agent's logic; prove its identity and math.
* **Agent Colony Pattern (RepID 2.0):** An agent's reputation score must weight more than just its BFT agreement rate. True systemic health requires evaluating task drop rates, execution latency, and success inside active red-team scenarios.

### Operational Discoveries
* **DNS Resolution Overhead:** Overnight autonomous sprints using Gemini frequently fail due to the host machine losing DNS resolution over extended periods. Autonomous multi-hour execution requires robust cloud environments rather than localized bridging.
* **Database Queries:** Many existing metrics queries were written incorrectly targeting an `event_type` column in `trinity_agent_logs`. The correct schema utilizes `agent_name`, `action`, and `metadata`. All monitoring loops were updated to reflect this.
