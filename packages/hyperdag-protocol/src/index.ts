/**
 * @hyperdag/core — HyperDAG Protocol Foundation
 *
 * Layer 0 protocol providing:
 * - Plonky3 ZKP circuits (proof generation/verification)
 * - ERC-8004 Identity + Reputation registries
 * - ANFIS LASSO routing engine
 * - DAG consensus + BFT (Pythagorean Comma veto)
 * - x402 payment transport
 * - Federated learning pricing mechanism
 *
 * Language target: Rust (primary) + TypeScript (bindings)
 * Current: TypeScript scaffold — Rust core TBD
 */

// ZKP Circuits
export { ZKPProver, ZKPVerifier, type ZKPProof, type ZKPCircuit } from './zkp/prover';

// Identity & Reputation (ERC-8004)
export { IdentityRegistry, ReputationRegistry, type RepID, type SBTCredential } from './identity/registry';

// ANFIS LASSO Routing
export { ANFISRouter, type RouteDecision, type ProviderScore } from './routing/anfis';

// DAG Consensus + BFT
export { BFTConsensus, PythagoreanVeto, type ConsensusResult, type VetoDecision } from './consensus/bft';

// x402 Payment Transport
export { X402Transport, type PaymentReceipt, type PaymentChannel } from './transport/x402';
