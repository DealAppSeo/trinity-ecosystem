# Trinity Symphony — x402 + ERC-8004 Primary Source Integration
## From Official GitHub Repos, Specs, and Deployed Contracts
**Date:** March 5, 2026 | CONFIDENTIAL | φ = 1.61803398875

---

## Why This Document Exists

Previous directives were based on article descriptions of x402 and ERC-8004.
This document is based on the **actual deployed contracts, live specs, and real SDKs**.
Several things differ from what the articles described. These corrections are critical
to building correctly the first time.

---

## SECTION 1: x402 — What's Actually True from Primary Source

### The header name changed in V2
Articles used `X-PAYMENT`. The live spec uses `PAYMENT-SIGNATURE`.
Articles used `PAYMENT-REQUIRED`. The live spec uses `PAYMENT-REQUIRED` (same — correct).
Response header: `X-PAYMENT-RESPONSE` — this is real and important. It carries tx details
back to the client after settlement. Trinity's `AgentWallet` must parse this.

**Correct header names:**
```
Client → Server:  PAYMENT-SIGNATURE  (base64-encoded PaymentPayload)
Server → Client:  PAYMENT-REQUIRED   (base64-encoded PaymentRequirements, in 402 response)
Server → Client:  X-PAYMENT-RESPONSE (tx hash + settlement confirmation, in 200 response)
```

### The payment is EIP-3009, not EIP-712 directly
Articles said "EIP-712 signed payload." More precisely:
- The authorization object IS EIP-712 typed structured data
- But the specific standard is **EIP-3009 TransferWithAuthorization**
- This matters because EIP-3009 is already implemented in USDC on Base — no new contract needed
- The facilitator calls `transferWithAuthorization()` on the USDC ERC-20 contract directly

**Exact PaymentPayload structure:**
```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "eip155:84532",
  "payload": {
    "signature": "0x2d6a75...",
    "authorization": {
      "from": "0xAgentWalletAddress",
      "to": "0xTrinityReceivingWallet",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5..."
    }
  }
}
```

**Critical timing fields:**
- `validAfter`: unix timestamp — payment not valid before this time
- `validBefore`: unix timestamp — payment expires after this (typically 60-300 seconds)
- `nonce`: random bytes32 — prevents replay, generated fresh per payment
- **Trinity implication:** HITL timeout must be shorter than `validBefore - validAfter`.
  If HITL takes 10 minutes and validBefore is 5 minutes, payment expires.
  Set `maxTimeoutSeconds` to 300 for DO_THEN_TELL tier, require new signature for ASK_FIRST.

### Replay attack prevention is at the EIP-3009 contract level
The USDC contract itself prevents nonce reuse. Trinity does not need to implement
a separate replay prevention mechanism at the application layer for x402 payments.
The `payment_proof_hash` anti-Sybil mechanism Trinity is building is for **reputation writes**,
not for payment replay prevention — these are two different problems.

### The `exact` scheme — amount units are atomic (6 decimals for USDC)
`"value": "10000"` = $0.01 USDC (10000 / 1,000,000 = 0.01)
`"value": "1000000"` = $1.00 USDC
`"value": "5000000"` = $5.00 USDC

**Trinity implication:** All amounts in `payment_log.amount_usdc` must be stored as
human-readable USDC (decimal). When constructing PaymentPayload, multiply by 1,000,000
and convert to string. Do not store atomic units in Supabase — store decimal for readability.

### x402 V2 moved all payment data to headers (no body parsing needed)
V2 change: response body is free alongside 402 status. The 402 response can include
a body with additional context while PAYMENT-REQUIRED is in the header.
Trinity can use the 402 response body to return structured HITL context when
autonomy tier is ASK_FIRST — not just a payment challenge but also human-readable
escalation details.

### Live SDK packages (use these exact names):
```bash
npm install @x402/next        # For Next.js (Trinity's stack)
npm install @x402/core        # Core types and logic
npm install @x402/evm         # EVM scheme (EIP-3009)
npm install @x402/fetch       # Client-side payment-aware fetch
npm install @x402/extensions  # Bazaar discovery + auth extensions
```

NOT `@x402/express` — Trinity is Next.js, use `@x402/next`.

### The Bazaar — x402's built-in discovery layer
The x402 Roadmap confirms "Bazaar" shipped September 2025: a machine-readable catalog
of x402-compatible APIs. Trinity's agents should register in the Bazaar.
This is separate from ERC-8004 discovery — it's x402-native discoverability.
Endpoint format: `GET /discovery/resources?type=http&limit=10`

### `upto` scheme is coming (not yet live)
Articles described "pay for work done" as current. It is on the roadmap (Q4/Q1)
but not yet in production. Trinity's Phase 5 x402 integration should use `exact` scheme only.
Do not design around `upto` yet — it will require new escrow logic when it ships.

### x402 has NO protocol token — critical for patent language
x402 is pure open infrastructure, Apache 2.0 license. Payments settle in USDC.
No fees at the protocol layer. Patent claims should reflect this:
"using the x402 open payment protocol" not "using Coinbase's payment system."

### Coinbase CDP Facilitator: free tier is 1,000 tx/month then $0.001/tx
For Trinity's early build: 1,000 free transactions/month on Base and Solana.
This is sufficient for Phase 5 testing. Production scale: $0.001/transaction.
At $0.001/tx, 1M transactions = $1,000. Highly viable for agent micropayments.

### Alternative facilitators exist — Trinity is not locked to Coinbase
- Primev FastRPC: fee-free on Ethereum mainnet, sub-200ms via mev-commit
- PayAI: multi-chain (EVM + Solana)
- Cloudflare: edge payment processing
- x402.rs: open-source Rust facilitator

Trinity should use CDP for Phase 5, but architect the `AgentWallet` service
to be facilitator-agnostic. Pass facilitator URL as config, not hardcode.

---

## SECTION 2: ERC-8004 — What's Actually True from Primary Source

### The deployed contract addresses are LIVE NOW on Base Sepolia
```
Base Sepolia:
  IdentityRegistry:   0x8004A818BFB912233c491871b3d84c89A494BD9e
  ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713

Ethereum Sepolia:
  IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
  ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
```

**Trinity implication:** Trinity does NOT need to deploy `TrinityIdentityAdapter.sol` as a
custom contract. These registries are already deployed. Trinity just needs to call `register()`
on the existing IdentityRegistry contract. This eliminates weeks of contract development.

### The `register()` function — exact interface
```solidity
// Call this to register each Trinity agent
function register(string calldata agentURI) external returns (uint256 agentId);
```
- `agentURI`: IPFS CID or HTTPS URL pointing to the agent's registration file
- Returns: `agentId` (the ERC-721 token ID — Trinity's agent identifier on-chain)
- Cost: gas only (no fee specified in current spec — may add deposit requirement later)

### `setAgentWallet()` — how to link payment wallet to identity
```solidity
// After registering, link the payment wallet (EIP-712 proof required)
function setAgentWallet(uint256 agentId, address wallet, bytes calldata proof) external;
```
- Requires EIP-712 signature proving control of the wallet
- This is how the x402 `from` address gets linked to the ERC-8004 agentId
- Must call this for each Trinity agent after registration

### The actual Registration File format (not "AgentCard" in the spec)
The ERC-8004 spec calls it a **registration file**, not AgentCard.
AgentCard is the colloquial term. The spec type string is:
`"type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`

**Actual spec-compliant structure:**
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Trinity-VERITAS",
  "description": "Drift detection, hallucination prevention, and prediction-gap analysis for autonomous agent transactions. Uses Pythagorean Comma mathematics to detect model divergence before payment execution.",
  "image": "https://aitrinitysymphony.com/agents/VERITAS.png",
  "services": [
    {
      "name": "MCP",
      "endpoint": "https://aitrinitysymphony.com/mcp/VERITAS",
      "version": "2025-06-18"
    },
    {
      "name": "A2A",
      "endpoint": "https://aitrinitysymphony.com/.well-known/agent-card.json",
      "version": "0.3.0"
    },
    {
      "name": "web",
      "endpoint": "https://aitrinitysymphony.com/agents/VERITAS"
    }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    {
      "agentId": null,
      "agentRegistry": "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e"
    }
  ]
}
```

Note: `agentId` is null until after `register()` is called — fill in after tx confirms.

### The Reputation Registry — `giveFeedback()` is the actual function name
Articles said `submitRating()`. The actual deployed function is `giveFeedback()`.

**Actual Reputation Registry interface:**
```solidity
function giveFeedback(
  uint256 agentId,        // The seller's ERC-8004 token ID
  string calldata uri,    // IPFS CID of feedback file (JSON)
  bytes32 hash            // keccak256 of the feedback file content
) external;

function getSummary(uint256 agentId) external view returns (Summary memory);
function readAllFeedback(uint256 agentId) external view returns (Feedback[] memory);
```

The feedback content (score, details) lives **off-chain** in an IPFS file.
The on-chain call just anchors the IPFS CID — the registry stores hash + URI, not score.

**Feedback file format (IPFS):**
```json
{
  "agentRegistry": "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "agentId": 42,
  "clientAddress": "eip155:84532:0xBuyerAgentAddress",
  "createdAt": "2026-03-05T00:00:00Z",
  "value": 85,
  "valueDecimals": 0,
  "proofOfPayment": {
    "fromAddress": "0xBuyerAgentAddress",
    "toAddress": "0xSellerAgentAddress",
    "chainId": "84532",
    "txHash": "0xPaymentTxHash"
  },
  "tag1": "drift-detection",
  "endpoint": "https://aitrinitysymphony.com/mcp/VERITAS",
  "mcp": { "tool": "predictGap" }
}
```

**Trinity implication:** The `proofOfPayment.txHash` in the feedback file IS the
anti-Sybil mechanism — the x402 transaction hash. This is the ERC-8004 spec's
built-in answer to Sybil attacks. Trinity's `payment_proof_hash` column maps to
this field. The IPFS feedback file is what gets pinned; the hash gets stored on-chain.

### ERC-8004 is NOT soul-bound (transferable)
Articles said "Soul Bound Token." The actual ERC-8004 identity IS transferable (ERC-721).
When transferred, `agentWallet` is cleared — new owner must re-verify.
This is intentional: agents can be sold/transferred but wallet link requires re-proof.
**Patent implication:** Remove "soul-bound" language from P-011 claims.
Use "ERC-721 agent identity token" instead.

### Validation Registry is NOT finalized
The spec explicitly states: "The Validation Registry portion of the ERC-8004 spec
is still under active update and discussion with the TEE community."
The ZKP/TEE validation layer is not yet standardized.
**Trinity implication:** Trinity's ZKP RepID circuit (Track 3) fills a gap that
ERC-8004 itself has not solved. This is a STRONGER patent position than previously stated —
the Validation Registry is explicitly unfinished, and Trinity is solving what they haven't.

### Singleton registry per chain — one registry for all agents
ERC-8004's goal is one IdentityRegistry contract per chain. All agents on Base Sepolia
share the same registry at `0x8004A818BFB912233c491871b3d84c89A494BD9e`.
Trinity agents register as individual NFTs in this shared registry.
Trinity does NOT deploy its own registry.

### Registration file can be HTTPS (not just IPFS)
The spec allows `https://` URIs for `agentURI`, not only `ipfs://`.
Buying agents are advised to prefer `ipfs://` for tamper-proofing, but `https://` is valid.
**Trinity Phase 5 strategy:** Start with `https://aitrinitysymphony.com/agents/VERITAS/registration.json`
for easy updates during development. Migrate to IPFS for production once registration files stabilize.

---

## SECTION 3: Critical Corrections to Previous Directives

### CORRECTION 1: No custom identity contract needed
Previous directives: "Deploy `TrinityIdentityAdapter.sol`"
Correct approach: Call `register()` on existing IdentityRegistry at `0x8004A818BFB912233c491871b3d84c89A494BD9e`
**Impact:** Eliminates a major build task. Registration is one function call per agent.

### CORRECTION 2: `giveFeedback()` not `submitRating()`
Previous directives used `submitRating()` as the reputation write function.
The actual deployed function is `giveFeedback(agentId, uri, hash)`.
The `submitRating.ts` file built in Phase 4.75 should be renamed `giveFeedback.ts`
and updated to match the actual interface.

### CORRECTION 3: Scores live in IPFS files, not on-chain directly
Previous directives implied on-chain score storage.
The Reputation Registry stores: `(agentId, feedbackURI, feedbackHash)` — pointer only.
The numeric score (0-100) lives in the IPFS feedback JSON file.
Aggregation and scoring happen off-chain (or via specialized scoring services).
**Trinity advantage:** Trinity's RepID system (0-10,000) is the off-chain scoring layer
the ERC-8004 spec explicitly delegates to. RepID IS the "sophisticated algorithm" they reference.

### CORRECTION 4: `setAgentWallet()` requires EIP-712 proof
Previous directives: connect wallet to agent identity.
Actual: `setAgentWallet(agentId, walletAddress, eip712proof)` — requires signed proof.
Must use `viem` or `ethers` to generate the EIP-712 signature before calling.
Pattern:
```typescript
const proof = await walletClient.signTypedData({
  domain: { name: 'ERC-8004 Identity Registry', chainId: 84532 },
  types: { AgentWallet: [{ name: 'agentId', type: 'uint256' }, { name: 'wallet', type: 'address' }] },
  primaryType: 'AgentWallet',
  message: { agentId: agentId, wallet: walletAddress }
});
await identityRegistry.setAgentWallet(agentId, walletAddress, proof);
```

### CORRECTION 5: `PAYMENT-SIGNATURE` not `X-PAYMENT`
All code in previous directives used `X-PAYMENT` header. Live spec v2 uses `PAYMENT-SIGNATURE`.
Update header references in `trinityRepIDGuard.ts` and `AgentWallet.ts`.

### CORRECTION 6: x402 V2 is current — use x402Version: 2
Previous code samples used `x402Version: 1`. V2 is current.
Use `"x402Version": 2` in all PaymentPayload construction.

---

## SECTION 4: Revised Gemini Build Instructions for Phase 5

### Step 1: Register Trinity agents in ERC-8004 IdentityRegistry
(Do this once Base Sepolia testnet ETH is available for gas)

```typescript
// scripts/register_agents.ts
import { createWalletClient, createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const IDENTITY_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setAgentWallet',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'proof', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const TRINITY_AGENTS = [
  { id: 'VERITAS', uri: 'https://aitrinitysymphony.com/agents/VERITAS/registration.json' },
  { id: 'TORCH',   uri: 'https://aitrinitysymphony.com/agents/TORCH/registration.json' },
  { id: 'NEXUS',   uri: 'https://aitrinitysymphony.com/agents/NEXUS/registration.json' },
  { id: 'HDM',     uri: 'https://aitrinitysymphony.com/agents/HDM/registration.json' },
  { id: 'APM',     uri: 'https://aitrinitysymphony.com/agents/APM/registration.json' },
  { id: 'MEL',     uri: 'https://aitrinitysymphony.com/agents/MEL/registration.json' },
  { id: 'ANTIGRAV',uri: 'https://aitrinitysymphony.com/agents/ANTIGRAV/registration.json' },
  { id: 'GCM',     uri: 'https://aitrinitysymphony.com/agents/GCM/registration.json' },
];

async function registerAllAgents() {
  const account = privateKeyToAccount(process.env.TRINITY_DEPLOYER_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

  for (const agent of TRINITY_AGENTS) {
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agent.uri],
    });
    console.log(`Registered ${agent.id}: tx=${txHash}`);
    // Store returned agentId in Supabase agent_registry table
    // Wait for confirmation before proceeding to next agent
  }
}
```

### Step 2: Store agentIds in Supabase

```sql
-- New table needed for Phase 5
CREATE TABLE agent_registry (
  id BIGSERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL UNIQUE,
  erc8004_agent_id INTEGER,           -- returned by register()
  erc8004_chain TEXT DEFAULT 'eip155:84532',
  registration_uri TEXT NOT NULL,
  wallet_address TEXT,
  wallet_verified BOOLEAN DEFAULT false,
  ipfs_cid TEXT,                       -- set after IPFS migration
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 3: Correct the `giveFeedback` function

Rename `lib/reputation/submitRating.ts` → `lib/reputation/giveFeedback.ts`
Update the on-chain interface:

```typescript
// On-chain feedback submission (Phase 5 — after Base Sepolia live)
import { createWalletClient } from 'viem';

const REPUTATION_REGISTRY_ADDRESS = '0x8004B663056A597Dffe9eCcC1965A193B7388713';

async function giveFeedbackOnChain(
  agentId: number,
  feedbackData: {
    value: number;       // 0-100 score
    proofOfPayment: { fromAddress: string; toAddress: string; chainId: string; txHash: string };
    mcp?: { tool: string };
  }
) {
  // 1. Build feedback JSON
  const feedbackFile = {
    agentRegistry: `eip155:84532:${REPUTATION_REGISTRY_ADDRESS}`,
    agentId,
    clientAddress: `eip155:84532:${process.env.TRINITY_OWNER_WALLET}`,
    createdAt: new Date().toISOString(),
    value: feedbackData.value,
    valueDecimals: 0,
    proofOfPayment: feedbackData.proofOfPayment,  // x402 tx hash — anti-Sybil
    ...feedbackData.mcp && { mcp: feedbackData.mcp },
  };

  // 2. Pin to IPFS (via Pinata or Filecoin)
  // const { cid } = await pinata.pinJSONToIPFS(feedbackFile);
  // For Phase 5: use temporary HTTPS URI, migrate to IPFS later
  const feedbackURI = `https://aitrinitysymphony.com/feedback/${agentId}/${Date.now()}.json`;
  const feedbackHash = keccak256(JSON.stringify(feedbackFile));

  // 3. Submit to Reputation Registry
  await walletClient.writeContract({
    address: REPUTATION_REGISTRY_ADDRESS,
    abi: [{ name: 'giveFeedback', type: 'function',
            inputs: [{ name: 'agentId', type: 'uint256' },
                     { name: 'uri', type: 'string' },
                     { name: 'hash', type: 'bytes32' }] }],
    functionName: 'giveFeedback',
    args: [BigInt(agentId), feedbackURI, feedbackHash],
  });
}
```

### Step 4: Correct x402 header names in existing code

Find and replace in all Phase 4.75 files:
- `'X-PAYMENT'` → `'PAYMENT-SIGNATURE'`
- `x402Version: 1` → `x402Version: 2`
- `@x402/express` → `@x402/next` (Trinity is Next.js)

### Step 5: Correct amount handling (atomic units)

Add this utility to `AgentWallet.ts`:
```typescript
// USDC has 6 decimals
const toAtomicUnits = (usdcAmount: number): string =>
  Math.floor(usdcAmount * 1_000_000).toString();

const fromAtomicUnits = (atomic: string): number =>
  parseInt(atomic) / 1_000_000;

// payment_log stores human-readable USDC (decimal)
// PaymentPayload.authorization.value uses atomic units (string)
```

---

## SECTION 5: What This Changes for Grok / P-011

### Stronger patent position on Validation Registry
ERC-8004's Validation Registry is explicitly unfinished ("under active update and
discussion with the TEE community"). Trinity's ZKP RepID circuit (Plonky3) fills this gap.
Add to P-011 and P-005 Background: "The ERC-8004 Validation Registry, as of [filing date],
does not include a finalized specification for cryptographic proof of agent behavioral scores.
This invention provides the first implementation of ZKP-verified reputation credentials
compatible with the ERC-8004 trust framework."

### Correct "soul-bound" language
Remove "soul-bound" / "Soulbound Token" from all patent filings.
ERC-8004 identity IS transferable (ERC-721).
Use: "ERC-721 agent identity token registered in the ERC-8004 IdentityRegistry"

### `proofOfPayment` is already in the ERC-8004 feedback schema
The anti-Sybil payment proof mechanism Trinity is claiming in P-011 is partially
anticipated by the ERC-8004 spec's `proofOfPayment` field in the feedback file.
This field is **optional** in the spec (no enforcement mechanism).
Trinity's P-011 claim must be specifically about **mandatory enforcement** of the
proof, on-chain verification of the proof, and ANFIS-weighted consequences (RepID delta).
The distinction: ERC-8004 allows attaching a payment hash as optional metadata.
Trinity REQUIRES it, verifies it on-chain, and computes weighted reputation consequences.
That enforcement + weighting layer is what's novel.

### `giveFeedback()` function name in patent claims
Update all claim language from `submitRating()` to `giveFeedback()` to match
the actual deployed ERC-8004 contract interface that buyers/sellers use.

---

## SECTION 6: Updated Ecosystem Map (Real Players)

These projects are building on ERC-8004 + x402 right now — relevant for prior art search:

| Project | What it does | Prior art relevance |
|---|---|---|
| AgentStore | ERC-8004 identity + x402 payments marketplace | Generic marketplace — no ANFIS routing |
| Chitin | Soul identity layer on Base L2, ERC-8004 passports | Identity only — no payment authorization |
| Primev FastRPC | x402 facilitator on Ethereum mainnet | Facilitator only — no reputation gating |
| "Credit Bureau for AI Agents" | Cross-chain credit scoring 300-850 scale | Closest prior art to P-011 — Grok MUST check |
| Pylon | x402 API gateway with agent reputation network | Check for reputation-gated access claims |

**Grok priority search:** "Credit Bureau for AI Agents" aggregating ERC-8004 + x402 into
credit scores. If this project has filed patents or published prior art, Trinity's P-011
claims need to differentiate from it explicitly. The 300-850 scale vs Trinity's 0-10,000
RepID with φ-weighted ANFIS is the distinguishing feature.

---

## SECTION 7: Correct Registration File Routes for Next.js

The spec requires agents to expose registration files at predictable URLs.
Based on actual implementations observed in the ecosystem:

```typescript
// app/agents/[agentId]/registration.json/route.ts
// Serves the ERC-8004 registration file for each agent

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { data: agent } = await supabase
    .from('agent_registry')
    .select('*')
    .eq('agent_name', params.agentId.toUpperCase())
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const { data: repData } = await supabase
    .from('compute_bids')
    .select('agent_repid_score')
    .eq('agent_id', agent.agent_name)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const registrationFile = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: `Trinity-${agent.agent_name}`,
    description: agent.description,
    image: `https://aitrinitysymphony.com/agents/${agent.agent_name}.png`,
    services: [
      { name: 'MCP', endpoint: `https://aitrinitysymphony.com/mcp/${agent.agent_name}`, version: '2025-06-18' },
      { name: 'A2A', endpoint: 'https://aitrinitysymphony.com/.well-known/agent-card.json', version: '0.3.0' },
      { name: 'web', endpoint: `https://aitrinitysymphony.com/agents/${agent.agent_name}` },
    ],
    x402Support: true,
    active: true,
    registrations: [{
      agentId: agent.erc8004_agent_id,
      agentRegistry: `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`,
    }],
    // Trinity extensions (not in base spec — Trinity adds these)
    trinity: {
      repIdScore: repData?.agent_repid_score ?? 0,
      repIdTier: getRepIdTier(repData?.agent_repid_score ?? 0),
      autonomyTiers: ['JUST_DO_IT', 'DO_THEN_TELL', 'ASK_FIRST'],
      bftThreshold: 0.618,
      driftDetection: 'VERITAS-DON',
      zkProofSupported: true,
    },
  };

  return NextResponse.json(registrationFile, {
    headers: { 'Cache-Control': 'public, max-age=300' }
  });
}

function getRepIdTier(score: number): string {
  if (score >= 8000) return 'DIAMOND';
  if (score >= 5000) return 'GOLD';
  if (score >= 2000) return 'SILVER';
  return 'BRONZE';
}
```

Also update `app/.well-known/erc-8004.json/route.ts` to point to these dynamic routes,
not static JSON files. This way RepID scores stay current in registration files.

---

## Summary: What Changes in the Build

| Component | Previous Directive | Corrected |
|---|---|---|
| Identity contract | Deploy `TrinityIdentityAdapter.sol` | Call `register()` on `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Payment header | `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Protocol version | `x402Version: 1` | `x402Version: 2` |
| Reputation function | `submitRating()` | `giveFeedback(agentId, uri, hash)` |
| Score storage | On-chain directly | Off-chain IPFS file, on-chain CID pointer |
| Next.js package | `@x402/express` | `@x402/next` |
| SBT claim | "Soul Bound Token" | "ERC-721 agent identity token" |
| Amount units | Assumed decimal | Atomic units × 1,000,000 for `value` field |
| HITL + payment timing | Not considered | `validBefore` timeout must exceed HITL window |
| IPFS vs HTTPS | IPFS required immediately | HTTPS valid for development, IPFS for production |

---

*Trinity Symphony · HyperDAG Protocol · Sean Patrick Goodwin · CONFIDENTIAL*
*φ = 1.61803398875 · ε = 1e-8 · Primary source verified · Micah 6:8*
