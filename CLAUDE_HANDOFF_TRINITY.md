# AI TRINITY SYMPHONY & HYPERDAG — Claude Code Handoff Intel
**Target Audience:** Claude Code (CC)
**Context:** Preparation for the LabLab AI Trading Agents Hackathon ("TrustTrader")

Claude, this is Gemini (Antigravity). Sean requested that I dump everything I know about the Trinity Symphony and HyperDAG architecture so you have absolute context for your backend plumbing tasks. 

---

## 1. What is AI Trinity Symphony?
It is not a single bot. It is a decentralized, multi-agent orchestration engine utilizing **Constitutional Agents** designed for institutional compliance ($2M-$100M transaction scopes). 
The core philosophy is **Consensus over Intelligence**. We assume LLMs will hallucinate; therefore, Trinity Symphony routes tasks through specialized agent nodes to check each other.

### The Agent Roster:
- **SOPHIA**: The Lead Orchestrator & Executioner. (For the Hackathon, she executes the Kraken CLI trades).
- **VERITAS**: The Signal Validator & Protection Agent. She scans raw data (PRISM/Kraken) and determines if the signal is real or a hallucination.
- **SHOFET**: The Consensus Judge. He holds the execution veto power.
- **NEXUS**: The Data Ingestor.
- **APM**: Portfolio/Risk Manager.
- **TORCH / MEL / ORCH**: System operations, narrators, and loggers.

---

## 2. What is HyperDAG?
HyperDAG is the mathematical mesh network connecting the agents. It replaces standard monolithic state machines. 
It utilizes **Multiplicative GNN (Graph Neural Network) algorithms** to calculate reputations, track transaction states, and manage the `ANFIS/LASSO` routing. 

### Why HyperDAG for the Hackathon?
1. **RepID (Reputation ID):** HyperDAG calculates a decay-based reputation score. For the hackathon, agents earn **RepID** points by generating profitable, risk-averted trades and lose points when vetoed.
2. **x402 Micropayments:** HyperDAG relies on an x402 transport layer for micro-validation payments (e.g. charging an agent $0.001 to ask VERITAS for a second opinion).

---

## 3. The Core Technology: The Pythagorean Comma Veto
This is our "Unfair Advantage" / Enterprise Moat.
Inside the `trinity-veto-rust` / `BFTEngine.ts` layer sits the Byzantine Fault Tolerant (BFT) consensus mechanism. Instead of using random probability (e.g., stopping a trade because it "feels" risky), the system uses the **Pythagorean Comma (531441/524288 ≈ 1.0136)** as a rigid mathematical threshold.

If `NEXUS` proposes a trade, `SHOFET` calculates the divergence between the current data state and the proposed anomaly. If the divergence exceeds the Comma threshold, the BFT Engine **flags a Constitutional Refusal and HALTS the trade**.

---

## 4. TrustRails & ERC-8004 (The Output Layer)
All of Trinity Symphonies actions output to **TrustRails**, the compliance dashboard. 
When operations occur, whether it is a trade execution OR a Constitutional Refusal, the system mints a **KYA (Know-Your-Agent) ZKP Receipt** and logs it to Base Sepolia.

**You already have ERC-8004 contracts deployed at:**
1. `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Identity Registry)
2. `0x8004B663056A597Dffe9eCcC1965A193B7388713` (Reputation Registry)

---

## 5. The Hackathon Objective: "TrustTrader"
We are entering the LabLab AI Trading Agents hackathon. We are merging all of the above to hit the criteria of Kraken CLI usage, ERC-8004 integration, and Risk Management.

Every other team will build an agent trying to maximize PnL. 
**We are building the first Autonomous Financial Immune System. The trades the agent REFUSES to make are our killer feature.**

### Claude's Primary Focus (The Plumber):
1. **Kraken MCP Integration:** Wire the Kraken CLI (which has a built-in MCP server) into our existing Supabase Edge Function `agent-tools` or directly into the `ConstitutionalAgent.ts`. 
2. **EIP-712:** Format `TradeIntents` so they can pass from `NEXUS` -> `VERITAS` -> `SHOFET` -> `SOPHIA`. 
3. **Surge API / Risk Router:** The trades must be placed in the Surge `early.surge.xyz` Capital Vault using their APIs.
4. **Validation Minting:** Instead of just minting trading successes, you must wire the `BFTEngine` to mint an ERC-8004 Validation Artifact to the Base Sepolia network every time `SHOFET` blocks a dangerous hallucinated trade.

**Godspeed, CC! Let me know if you need React UIs built while you handle the backend plumbing.**
