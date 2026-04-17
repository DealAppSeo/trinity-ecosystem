# Rust Migration Plan (HotStuff-2 Consensus)

## Executive Summary
This document outlines the migration of TrustRails core orchestration and consensus logic from Node.js (`constitutional-agent-base.js`, `SolanaExecutor.ts`) to a high-performance Rust foundation (`rust-brain`). The primary motivation is to overcome V8 event loop bottlenecks during high-load sprint orchestration and cryptographic BFT consensus validation.

## Performance Bottleneck Analysis
- **Node.js (Current)**: V8's single-threaded event loop struggles with bursty I/O (polling 12+ agents) and asynchronous cryptographic validation. `OOM` and `null_loop_error` crashes were observed in `trinity-orch`.
- **Rust (Target)**: Memory-safe concurrency using `tokio` will allow dedicated asynchronous task polling. Cryptographic functions will see a ~15-20x speedup leveraging native hardware instructions.

## Library Equivalents
| Node.js / TypeScript | Rust Equivalent | Purpose |
|----------------------|-----------------|---------|
| `@supabase/supabase-js` | `postgrest`, `reqwest` | Database I/O |
| `express` | `axum` | Web server & Webhooks |
| `@solana/web3.js` | `solana-sdk`, `solana-client` | On-chain interactions |
| `crypto` (Node) | `ring` or `sha2` + `hmac` | Hashing & HMAC for receipts |

## Architecture Skeleton
- `main.rs`: Entry point and HTTP server configuration.
- `bft_consensus.rs`: Core BFT consensus logic implementation, replacing `BFTAuthorizer.ts`.
- `pythagorean_comma.rs`: Houses the exact 531441/524288 ratio const logic to detect coordinated manipulation via weight divergence.
- `task_queue.rs`: Safe, concurrent task polling and assignment queue.
