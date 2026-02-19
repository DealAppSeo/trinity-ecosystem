# 🧠 Core Concepts & Technical Definitions

The AI Trinity Symphony is built upon a trimergence of Web3, AI, and Antifragile Security. This document provides deep-dives into the core technical primitives that power our ecosystem.

---

## 🛡️ Byzantine Fault Tolerance (BFT)
**What it is:** A property of a computer system that allows it to reach consensus even if some of its components fail or act maliciously.
**Our Implementation (3-Ply BFT):**
We use a heterogeneous multi-agent consensus model:
1.  **Ply 1 (Execution):** 3+ agents from different LLM families (e.g., OpenAI, Anthropic, Google) perform the task.
2.  **Ply 2 (Verification):** Cross-family verifiers validate the outputs.
3.  **Ply 3 (Consensus):** An ANFIS-weighted logic determines the final "Truth" based on agent reputation (RepID) and past performance.
**Example:** For a critical security patch, we ensure that a Llama-based agent's code is verified by a Claude-based agent, with final consensus reached via a redundant GPT-4o output.

## 🧬 Evolutionary Swarm Pruning (ESP)
**What it is:** A bio-inspired mechanism for optimizing agent efficiency by removing redundant or underperforming components and "evolving" successful strategies.
**Our Implementation:**
Our **PruningEngine** continuously monitors agent fitness (Success Rate + 1/Latency).
- **Elites:** Top 50% are kept and rewarded.
- **Mutants:** Underperformers are "mutated" (hyperparameters adjusted) or repurposed for specialized low-risk tasks.
- **Culling:** Redundant or consistently failing agents are pruned to save compute cost.

## 🕸️ Merkle DAG (Directed Acyclic Graph)
**What it is:** A data structure where each node is content-addressed (hashed) and points to its "parents," creating a tamper-evident lineage.
**Our Implementation:**
Every routing decision and agent interaction in the Symphony is logged into an append-only Merkle DAG. This ensures:
- **Auditability:** We can trace any "bad" decision back to its source agents.
- **Integrity:** The system's state is verifiable and cannot be surreptitiously altered.

## 🧠 ANFIS (Adaptive Neuro-Fuzzy Inference System)
**What it is:** A hybrid artificial intelligence model that combines the reasoning of fuzzy logic with the learning capabilities of neural networks.
**Our Implementation:**
Used in our **IntelligenceRouter** to handle "grey area" decisions.
- **Fuzzy Logic:** Handles qualitative inputs like "High Risk" or "Urgent."
- **Neural Learning:** Adjusts the importance of cost vs. quality based on real-world win rates and spend budgets.

## 🆔 ZKP RepID (Zero-Knowledge Reputation ID)
**What it is:** A privacy-preserving identity system where agents and users can prove they have high reputation without revealing their underlying data.
**Our Implementation:**
RepID is an on-chain credential that governs an agent's "voting power" in the BFT consensus. If an agent consistently produces verifiable truth, its RepID grows, increasing its influence in the swarm.

## 📊 GNN (Graph Neural Networks)
**What it is:** AI models designed to work on graph-structured data (relationships).
**Our Implementation:**
Used for **Multiplicative GNN Coordination**. We treat the agent swarm as a graph where nodes are agents and edges are collaborative history. This allows the system to predict the "optimal squad" for any given task based on past "synergy" scores.

---

## 🏛️ Governance Models

### Quadratic Voting
A collective decision-making process where the "cost" of additional votes increases quadratically (1 vote = 1 credit, 2 votes = 4 credits). This prevents "whales" from dominating the symphony and ensures minority voices are heard.

### STAR Voting (Score, Then Automatic Runoff)
Ensures the most broadly acceptable candidate/decision wins by scoring candidates 0-5 and then running an automatic runoff between the top two.

---

[Back to README](README.md)
