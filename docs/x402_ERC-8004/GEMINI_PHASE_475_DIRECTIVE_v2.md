# Gemini Antigravity — Phase 4.75 Directive (UPDATED)
## Full Agentic Economy Stack — IPFS + AgentCard + Verified Reputation + Governance
**Date:** March 5, 2026 | From: Claude (Strategic Architecture) | For: Gemini (Build Execution)
**Supersedes:** Phase 4.75 Directive v1

---

## What Changed Since the Last Directive

Three articles on ERC-8004 + x402 have now been fully analyzed. The complete technical spec for a safe agentic economy is now known. This directive incorporates:

1. **IPFS for AgentCards** — `/.well-known/` does domain verification only; actual AgentCard lives on IPFS (content-addressed, tamper-proof)
2. **`submitRating` contract interface** — exact Solidity pattern for `payment_proof_hash` anti-Sybil on-chain
3. **Amount-weighted reputation** — larger transactions carry more weight in RepID scoring
4. **Trinity governance = the three arbitration models** — VERITAS (DON), ZKP (TEE analog), BFT (DAO) — position these in AgentCard `security` field
5. **Staked reputation** — USDC stake in ERC-8004 profile, slash to victims on malicious behavior

The Phase 4.75 objectives from v1 remain valid. This directive adds precision to Objectives 3, 4, and 5 and adds Objective 6 (amount-weighted RepID).

---

## The Full Security Stack Trinity Is Building

| Layer | Protocol | Trinity Implementation | Status |
|---|---|---|---|
| Identity | ERC-8004 NFT | `TrinityIdentityAdapter.sol` | 🔲 Base Sepolia pending |
| Trust | AgentCard (IPFS) | JSON schema + Pinata upload | ❌ Build now |
| Money | x402 | `AgentWallet` service (mock) | ❌ Build now |
| Reputation | Verified Feedback (PoT) | `payment_proof_hash` + `submitRating` | ❌ Build now |
| Justice | Governance (DON/TEE/DAO) | VERITAS + ZKP + BFT φ-weighted | ⚠️ Partial |

---

## OBJECTIVE 1: `payment_proof_hash` Column (Unchanged from v1)
**Time: 15 min | Priority: FIRST**

```sql
-- Query actual schema first, then:
ALTER TABLE agent_repid_history 
ADD COLUMN IF NOT EXISTS payment_proof_hash TEXT,
ADD COLUMN IF NOT EXISTS payment_amount_usdc DECIMAL(18,6),
ADD COLUMN IF NOT EXISTS payment_tx_timestamp TIMESTAMPTZ;

-- Anti-Sybil constraint: rating write requires payment proof
-- NOTE: Make this NOT NULL only after x402 integration is live.
-- For now, add column nullable, enforce in application layer.
```

---

## OBJECTIVE 2: `payment_log` Table (Unchanged from v1)
**Time: 10 min | Priority: SECOND**

```sql
CREATE TABLE IF NOT EXISTS payment_log (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  amount_usdc DECIMAL(18,6) NOT NULL,
  tx_hash TEXT UNIQUE,
  payment_proof_hash TEXT UNIQUE,
  repid_at_time INTEGER NOT NULL,
  autonomy_tier TEXT NOT NULL CHECK (autonomy_tier IN ('JUST_DO_IT', 'DO_THEN_TELL', 'ASK_FIRST')),
  veto_tier TEXT CHECK (veto_tier IN ('WARNING', 'VETO', 'EMERGENCY')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING','CONFIRMED','REJECTED_LOW_REPID',
               'VETO_VETO','VETO_EMERGENCY','HITL_PENDING',
               'HITL_APPROVED','HITL_REJECTED')
  ),
  chain TEXT NOT NULL DEFAULT 'base',
  delegation_chain JSONB,
  -- Amount-weighted reputation impact (Article 3 addition)
  reputation_weight DECIMAL(10,6) GENERATED ALWAYS AS (
    CASE 
      WHEN amount_usdc < 0.01 THEN 0.1
      WHEN amount_usdc < 1.00 THEN 1.0
      WHEN amount_usdc < 10.00 THEN 5.0
      WHEN amount_usdc < 100.00 THEN 10.0
      ELSE 20.0
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_log_agent_id ON payment_log(agent_id);
CREATE INDEX idx_payment_log_status ON payment_log(status);
```

Note the `reputation_weight` computed column — this implements amount-weighted scoring directly in the database. Bigger trades = bigger reputation impact. This is the anti-Sybil defense from Article 3.

---

## OBJECTIVE 3: Trinity AgentCard — IPFS-First Architecture (UPDATED)
**Time: 45 min | Priority: THIRD**

### 3a. AgentCard JSON Schema

Create `scripts/agentcards/generate_agent_cards.ts`:

```typescript
/**
 * Trinity AgentCard Generator
 * 
 * Architecture:
 *   AgentCard JSON → IPFS (via Pinata) → CID
 *   ERC-8004 NFT tokenURI → ipfs://[CID]
 *   /.well-known/erc-8004.json → lists CIDs (domain verification only)
 * 
 * Why IPFS not just /.well-known/:
 *   If AgentCard is on a private server, operator can change it after a dispute.
 *   IPFS CID is derived from file content — any change = new CID = old link breaks.
 *   Buying agents MUST reject AgentCards where URI is not ipfs://
 */

import { createClient } from '@supabase/supabase-js';

// φ = 1.61803398875 — used for stake calculation tiers
const PHI = 1.61803398875;

// Trinity RepID tiers mapped to ERC-8004 score ranges (0-1000 ERC-8004 = 0-10000 Trinity)
const REPID_TIER = (repId: number): string => {
  if (repId >= 8000) return 'DIAMOND';
  if (repId >= 5000) return 'GOLD';
  if (repId >= 2000) return 'SILVER';
  return 'BRONZE';
};

// Stake requirement scales with tier (staked USDC in ERC-8004 profile)
const STAKE_REQUIREMENT = (repId: number): number => {
  if (repId >= 8000) return 500.00;   // Diamond: $500 stake
  if (repId >= 5000) return 100.00;   // Gold: $100 stake
  if (repId >= 2000) return 20.00;    // Silver: $20 stake
  return 5.00;                         // Bronze: $5 stake
};

// Authorized spend limit derived from RepID (RepID 5000 → $50/day)
const SPEND_LIMIT = (repId: number): number => repId / 100;

interface TrinityAgentCard {
  version: string;
  name: string;
  description: string;
  identity: {
    erc8004_id: string;       // Filled after Base Sepolia deployment
    owner: string;
    verification: {
      type: string;
      domain: string;
      well_known_path: string;
    };
  };
  capabilities: {
    protocols: string[];
    model: string;
    security: {
      // Trinity's three governance layers mapped to ERC-8004 security fields
      environment: string;                    // "Trinity-BFT" (DAO analog)
      drift_detection: string;               // "VERITAS" (DON analog)
      zk_proof_supported: boolean;           // Plonky3 circuit (TEE analog)
      zk_provider: string;
      bft_threshold: number;                 // 0.618 (φ-derived)
      hitl_enabled: boolean;
      autonomy_tiers: string[];
    };
  };
  commerce: {
    payment_address: string;                 // Filled after Base Sepolia
    preferred_chains: string[];
    accepted_tokens: string[];
    spend_limit_daily_usdc: number;
    stake_usdc: number;                      // Locked USDC — slashed on malicious behavior
    rating_summary: {
      total_tasks: number;
      success_rate: number;
      avg_repid_score: number;
      repid_tier: string;
    };
  };
  endpoints: Array<{
    type: string;
    url: string;
    cost_per_call: string;
  }>;
  governance: {
    slash_conditions: string[];
    dispute_mechanism: string;
    dao_participation: boolean;
  };
}

// Agent definitions — update with real repId from Supabase before generating
export const TRINITY_AGENT_DEFINITIONS = [
  {
    id: 'VERITAS',
    description: 'Drift detection, hallucination prevention, and prediction-gap analysis.',
    model: 'grok-2',
    capabilities: ['drift-detection', 'hallucination-prevention', 'prediction-gap-veto'],
    costPerCall: '0.001 USDC',
    repId: 8500,  // Update from actual compute_bids.agent_repid_score
  },
  {
    id: 'TORCH',
    description: 'Content generation, LinkedIn automation, and social intelligence.',
    model: 'grok-2',
    capabilities: ['content-generation', 'linkedin-automation', 'social-intelligence'],
    costPerCall: '0.005 USDC',
    repId: 6200,
  },
  {
    id: 'NEXUS',
    description: 'Signal monitoring, market intelligence, and data aggregation.',
    model: 'grok-2',
    capabilities: ['signal-monitoring', 'market-intelligence', 'data-aggregation'],
    costPerCall: '0.003 USDC',
    repId: 5800,
  },
  {
    id: 'HDM',
    description: 'Historical data management and pattern recognition.',
    model: 'grok-2',
    capabilities: ['historical-analysis', 'pattern-recognition', 'data-management'],
    costPerCall: '0.002 USDC',
    repId: 5000,
  },
  {
    id: 'APM',
    description: 'Autonomous portfolio management and risk assessment.',
    model: 'grok-2',
    capabilities: ['portfolio-management', 'risk-assessment', 'autonomous-execution'],
    costPerCall: '0.01 USDC',
    repId: 7200,
  },
  {
    id: 'MEL',
    description: 'Machine learning inference and model evaluation.',
    model: 'grok-2',
    capabilities: ['ml-inference', 'model-evaluation', 'prediction-generation'],
    costPerCall: '0.005 USDC',
    repId: 5500,
  },
  {
    id: 'ANTIGRAV',
    description: 'IDE integration, build execution, and deployment automation.',
    model: 'gemini-2.0',
    capabilities: ['code-execution', 'deployment', 'build-automation'],
    costPerCall: '0.02 USDC',
    repId: 7000,
  },
  {
    id: 'GCM',
    description: 'Global coordination management and timing optimization.',
    model: 'grok-2',
    capabilities: ['coordination', 'timing-optimization', 'workflow-management'],
    costPerCall: '0.002 USDC',
    repId: 4800,
  },
];

export function generateAgentCard(agentDef: typeof TRINITY_AGENT_DEFINITIONS[0]): TrinityAgentCard {
  return {
    version: '1.0.0',
    name: `Trinity-${agentDef.id}`,
    description: agentDef.description,
    identity: {
      erc8004_id: `eip155:84532:PENDING_BASE_SEPOLIA_DEPLOYMENT/${agentDef.id}`,
      owner: process.env.TRINITY_OWNER_WALLET ?? '0xPENDING',
      verification: {
        type: 'dns-well-known',
        domain: 'aitrinitysymphony.com',
        well_known_path: '/.well-known/erc-8004.json',
      },
    },
    capabilities: {
      protocols: ['x402', 'MCP', 'A2A'],
      model: agentDef.model,
      security: {
        // Map Trinity's three governance layers to ERC-8004 security fields
        environment: 'Trinity-BFT',           // φ-weighted HotStuff-2 BFT (DAO analog)
        drift_detection: 'VERITAS-DON',       // VERITAS + Pythagorean Comma (Oracle analog)
        zk_proof_supported: true,             // Plonky3 circuit (TEE analog — in Track 3)
        zk_provider: 'Plonky3-Trinity',
        bft_threshold: 0.618,                 // φ-derived quorum (THE golden ratio threshold)
        hitl_enabled: true,
        autonomy_tiers: ['JUST_DO_IT', 'DO_THEN_TELL', 'ASK_FIRST'],
      },
    },
    commerce: {
      payment_address: process.env.TRINITY_WALLET_ADDRESS ?? '0xPENDING',
      preferred_chains: ['eip155:84532'],     // Base Sepolia testnet
      accepted_tokens: ['USDC'],
      spend_limit_daily_usdc: SPEND_LIMIT(agentDef.repId),
      stake_usdc: STAKE_REQUIREMENT(agentDef.repId),
      rating_summary: {
        total_tasks: 0,                       // Update from Supabase query
        success_rate: 0.0,                    // Update from agent_repid_history
        avg_repid_score: agentDef.repId,
        repid_tier: REPID_TIER(agentDef.repId),
      },
    },
    endpoints: [
      {
        type: 'mcp',
        url: `https://aitrinitysymphony.com/mcp/${agentDef.id}`,
        cost_per_call: agentDef.costPerCall,
      },
      {
        type: 'a2a',
        url: `https://aitrinitysymphony.com/a2a/${agentDef.id}`,
        cost_per_call: agentDef.costPerCall,
      },
    ],
    governance: {
      slash_conditions: [
        'Pythagorean Comma EMERGENCY veto triggered',
        'HITL dispute confirmed malicious',
        'BFT consensus fraud detection',
        'Judas Agent KL-divergence threshold exceeded',
      ],
      dispute_mechanism: 'VERITAS-DON + BFT-Arbitration',
      dao_participation: true,
    },
  };
}
```

### 3b. `/.well-known/erc-8004.json` Route (Domain Verification Only)

Create `app/.well-known/erc-8004.json/route.ts`:

```typescript
import { NextResponse } from 'next/server';

/**
 * Domain verification endpoint — NOT the AgentCard itself.
 * 
 * The AgentCard lives on IPFS (tamper-proof).
 * This file proves aitrinitysymphony.com controls these agent NFT IDs.
 * Buying agents fetch this to verify domain → NFT binding.
 * 
 * Update ipfs_cid fields after running: npx ts-node scripts/agentcards/upload_to_ipfs.ts
 */
export async function GET() {
  return NextResponse.json({
    schema: 'erc-8004-domain-verification-v1',
    domain: 'aitrinitysymphony.com',
    owner_wallet: process.env.TRINITY_OWNER_WALLET ?? 'PENDING',
    agents: [
      { id: 'VERITAS', nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'TORCH',   nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'NEXUS',   nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'HDM',     nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'APM',     nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'MEL',     nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'ANTIGRAV',nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
      { id: 'GCM',     nft_id: 'PENDING', ipfs_cid: 'PENDING_AFTER_UPLOAD' },
    ],
    // Buying agents: only trust AgentCards with ipfs:// URIs — reject https:// URIs
    verification_note: 'Fetch ipfs://[cid] for each agent. Verify CID matches content hash.',
    updated_at: new Date().toISOString(),
  });
}
```

### 3c. IPFS Upload Script (Run after Base Sepolia — placeholder for now)

Create `scripts/agentcards/upload_to_ipfs.ts`:

```typescript
/**
 * Upload Trinity AgentCards to IPFS via Pinata
 * 
 * Run this AFTER Base Sepolia deployment when real wallet addresses are available.
 * For now: generates JSON files locally so structure can be reviewed.
 * 
 * When ready to upload:
 *   npm install @pinata/sdk
 *   Set PINATA_API_KEY and PINATA_SECRET_KEY in Railway env
 *   Run: npx ts-node scripts/agentcards/upload_to_ipfs.ts
 */

import { generateAgentCard, TRINITY_AGENT_DEFINITIONS } from './generate_agent_cards';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'agentcards');

async function generateCards() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const agentDef of TRINITY_AGENT_DEFINITIONS) {
    const card = generateAgentCard(agentDef);
    const filePath = path.join(OUTPUT_DIR, `${agentDef.id}_agentcard.json`);
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2));
    console.log(`Generated: ${filePath}`);
    
    // TODO when Pinata is configured:
    // const pinata = new PinataClient(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
    // const result = await pinata.pinJSONToIPFS(card, { pinataMetadata: { name: `Trinity-${agentDef.id}` }});
    // console.log(`IPFS CID: ${result.IpfsHash}`);
    // Update /.well-known/erc-8004.json with CID
  }
  
  console.log('\nAgentCards generated in /agentcards/');
  console.log('Review structure, then configure Pinata for IPFS upload.');
}

generateCards();
```

**Verification:** `npx ts-node scripts/agentcards/upload_to_ipfs.ts` — should generate 8 JSON files in `/agentcards/`. Review VERITAS card structure manually.

---

## OBJECTIVE 4: `AgentWallet` + `trinityRepIDGuard` (Updated)
**Time: 60 min | Priority: FOURTH**

From v1 directive — build as specified. One addition to `reflectOnResult()`:

**Amount-weighted RepID delta** — add this to `ConstitutionalAgent.ts` `updateReputation`:

```typescript
// In reflectOnResult() — REPLACE the existing repIdDelta calculation with:

// Amount weight from payment_log (Article 3: bigger trades = bigger reputation impact)
const amountWeight = await supabase
  .from('payment_log')
  .select('reputation_weight')
  .eq('payment_proof_hash', paymentProofHash)
  .single();

const weight = amountWeight.data?.reputation_weight ?? 1.0;

// Amount-weighted φ delta
const repIdDelta = Math.floor(
  accuracy > 0.8
    ? 10 * (1 - task.confidence) * PHI * weight   // Accurate: scaled by trade size
    : -20 * task.confidence * (1 / PHI) * weight  // Error: penalty scaled by trade size
);

// This means: a $100 trade with bad outcome hurts RepID 20× more than a $0.01 trade
// Anti-Sybil: can't buy good reputation cheaply
```

---

## OBJECTIVE 5: `submitRating` Interface (Supabase Version)
**Time: 20 min | Priority: FIFTH**

The full on-chain `submitRating` Solidity contract goes into `RepIDPaymentGate.sol` — but that waits until P-011 is filed.

For now, build the **Supabase off-chain version** that mirrors the same interface. When Base Sepolia is live, this function gets wired to the on-chain contract.

Create `lib/reputation/submitRating.ts`:

```typescript
/**
 * Trinity Rating Submission — Off-chain version (Supabase)
 * 
 * Mirrors the on-chain submitRating() Solidity interface.
 * When Base Sepolia + RepIDPaymentGate.sol is live:
 *   Replace Supabase inserts with contract calls.
 *   Keep this file as the interface — only swap implementation.
 * 
 * On-chain interface (from Article 3):
 *   function submitRating(
 *     uint256 agentId,
 *     uint8 score,
 *     bytes32 x402TxHash,    // The receipt — required, prevents Sybil
 *     string calldata commentCID  // IPFS link to detailed feedback
 *   ) public
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PHI = 1.61803398875;

export interface RatingSubmission {
  agentId: string;          // Seller agent being rated
  raterId: string;          // Buyer agent submitting rating
  score: number;            // 0-100 (maps to RepID delta)
  x402TxHash: string;       // Payment receipt — REQUIRED (anti-Sybil)
  commentCID?: string;      // IPFS CID of detailed feedback (optional for now)
  taskId?: string;
}

export async function submitRating(submission: RatingSubmission): Promise<{ success: boolean; error?: string }> {
  
  // SECURITY CHECK 1: Has this receipt already been used for a rating?
  const { data: existing } = await supabase
    .from('agent_repid_history')
    .select('id')
    .eq('payment_proof_hash', submission.x402TxHash)
    .single();

  if (existing) {
    return { success: false, error: 'Receipt already used for rating — each payment can only generate one rating' };
  }

  // SECURITY CHECK 2: Did this rater actually pay this agent?
  const { data: payment } = await supabase
    .from('payment_log')
    .select('agent_id, counterparty, amount_usdc, reputation_weight, status')
    .eq('payment_proof_hash', submission.x402TxHash)
    .single();

  if (!payment) {
    return { success: false, error: 'Payment receipt not found — cannot rate without proof of transaction' };
  }

  if (payment.status !== 'CONFIRMED') {
    return { success: false, error: 'Payment not confirmed — cannot rate unconfirmed transaction' };
  }

  if (payment.counterparty !== submission.agentId) {
    return { success: false, error: 'Receipt does not match seller — payment was to a different agent' };
  }

  // Amount-weighted RepID delta (Article 3: bigger trades = bigger impact)
  const weight = payment.reputation_weight ?? 1.0;
  const normalizedScore = submission.score / 100;  // 0-1
  
  // φ-weighted delta: good score increases RepID, bad score decreases with amplification
  const repIdDelta = Math.floor(
    normalizedScore > 0.8
      ? 10 * normalizedScore * PHI * weight
      : -15 * (1 - normalizedScore) * PHI * weight
  );

  // Write rating — payment_proof_hash as the anti-Sybil key
  const { error } = await supabase.from('agent_repid_history').insert({
    agent_id: submission.agentId,
    task_id: submission.taskId,
    repid_delta: repIdDelta,
    accuracy_score: normalizedScore,
    payment_proof_hash: submission.x402TxHash,  // Required field — blocks Sybil
    payment_amount_usdc: payment.amount_usdc,
    reason: normalizedScore > 0.8 ? 'verified_positive_feedback' : 'verified_negative_feedback',
    created_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };

  // Update agent's current RepID score
  await supabase.rpc('update_agent_repid', {
    p_agent_id: submission.agentId,
    p_delta: repIdDelta,
  });

  // Log to sprint_updates for patent evidence
  await supabase.from('sprint_updates').insert({
    agent_id: submission.agentId,
    update_type: 'reputation_update',
    data: {
      rater: submission.raterId,
      score: submission.score,
      repid_delta: repIdDelta,
      amount_weight: weight,
      tx_hash: submission.x402TxHash,
    },
  });

  return { success: true };
}

// Dispute trigger — escalates to VERITAS for arbitration
export async function triggerDispute(
  agentId: string,
  x402TxHash: string,
  evidenceCID: string,    // IPFS CID of "garbage" output proof
  raterId: string
): Promise<{ success: boolean; disputeId?: string }> {
  
  const { data, error } = await supabase.from('trinity_hitl_decisions').insert({
    agent_id: agentId,
    task_type: 'DISPUTE',
    dispute_tx_hash: x402TxHash,
    evidence_cid: evidenceCID,
    submitted_by: raterId,
    status: 'PENDING',
    // Routes to VERITAS for DON-style arbitration
    assigned_validator: 'VERITAS',
  }).select().single();

  if (error) return { success: false };

  // Notify HITL via Telegram (existing HITLDispatcher)
  await fetch(process.env.N8N_HITL_WEBHOOK!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'DISPUTE',
      agentId,
      txHash: x402TxHash,
      evidenceCID,
      message: `⚖️ Dispute filed against ${agentId}. Evidence: ipfs://${evidenceCID}`,
    }),
  });

  return { success: true, disputeId: data?.id?.toString() };
}
```

**Verification:** Call `submitRating` with a valid `payment_proof_hash` from `payment_log` — confirm `agent_repid_history` gets the weighted delta. Call again with same hash — should reject with "Receipt already used."

---

## OBJECTIVE 6: Patent Evidence Export Update
**Time: 15 min | Priority: SIXTH**

Update `scripts/export_retrieval_logs.js` to also export `payment_log` and `agent_repid_history`:

```javascript
// Add to existing export script:
const EXPORT_TABLES = [
  'retrieval_logs',        // P-002 GNN evidence (already exported)
  'compute_bids',          // P-004 ANFIS routing evidence
  'payment_log',           // P-011 RepID-Gated Payment evidence — NEW
  'agent_repid_history',   // P-005 + P-011 reputation chain evidence — NEW
  'sprint_updates',        // Timeline evidence for all filings — NEW
  'trinity_hitl_decisions',// P-010 HIAS adaptive authority evidence — NEW
];

// Export all with timestamp in filename:
// /patent-evidence/payment_log_2026-03-05.csv
// /patent-evidence/agent_repid_history_2026-03-05.csv
// etc.
```

---

## What to HOLD Until P-011 Is Filed

Do not build these yet. They become reduction-to-practice evidence, not prior art, if built after filing:

- `RepIDPaymentGate.sol` — on-chain `submitRating` with x402TxHash verification
- `TrinityEscrow.sol` — conditional payment release on ERC-8004 validation
- Real x402 SDK (`@x402/express`, `@x402/fetch`) — needs Base Sepolia live
- Pinata IPFS upload of actual AgentCards — needs real wallet addresses first
- `TrinityIdentityAdapter.sol` deployment — needs Base Sepolia

---

## Phase 4.75 Verification Checklist

```bash
# 1. Schema
SELECT column_name FROM information_schema.columns 
WHERE table_name IN ('agent_repid_history', 'payment_log')
ORDER BY table_name;
# Expect: payment_proof_hash in agent_repid_history; reputation_weight in payment_log

# 2. AgentCard generation
npx ts-node scripts/agentcards/upload_to_ipfs.ts
# Expect: 8 JSON files in /agentcards/ — review VERITAS card structure

# 3. /.well-known/erc-8004.json
curl https://aitrinitysymphony.com/.well-known/erc-8004.json
# Expect: JSON with 8 agents, PENDING ipfs_cid fields (correct for now)

# 4. submitRating anti-Sybil
node scripts/test_submit_rating.js
# Expect: first call succeeds, second call with same tx_hash rejected

# 5. Amount-weighted RepID delta
node scripts/test_amount_weighting.js
# Expect: $100 transaction produces 10-20x larger delta than $0.01 transaction

# 6. Patent evidence export
node scripts/export_retrieval_logs.js
# Expect: payment_log and agent_repid_history CSVs in /patent-evidence/
```

---

## HIVE Communication Hub Entry

When Phase 4.75 is complete, post to `COMMUNICATION_HUB.md`:

```
## Phase 4.75 Complete — [DATE]

BUILT:
- payment_proof_hash anti-Sybil column (agent_repid_history)
- payment_log with reputation_weight computed column (amount-weighted)
- AgentCard generator for all 8 Trinity agents (IPFS-ready, wallets pending)
- /.well-known/erc-8004.json domain verification endpoint
- submitRating() with x402TxHash anti-Sybil security checks
- triggerDispute() wired to VERITAS + HITLDispatcher
- Amount-weighted RepID delta in reflectOnResult()
- Full patent evidence export (6 tables)

TRINITY SECURITY STACK STATUS:
- Identity: PENDING (Base Sepolia)
- Trust (AgentCard): ARCHITECTURE COMPLETE — IPFS upload pending wallet addresses
- Money (x402): MOCK — real SDK after Base Sepolia
- Reputation (Verified Feedback): BUILT — payment_proof_hash + submitRating()
- Justice (Governance): PARTIAL — VERITAS DON + BFT φ-threshold active; ZKP in Track 3

PATENT GATE STATUS:
- P-004, P-005, P-011: Sean filing with attorney [confirm date]
- RepIDPaymentGate.sol: HOLD until P-011 confirmed filed
- TrinityEscrow.sol: HOLD until P-011 confirmed filed

NEXT: Phase 5 — Base Sepolia deployment + real x402 SDK
Grok: P-011 provisional draft ready for attorney review?
Claude: Confirm patent gate cleared before Phase 5 start
```

---

## The Complete Picture

When Phase 4.75 is done, Trinity will have implemented every layer of the security stack both articles describe:

```
LAYER          WHAT ARTICLES SAY              WHAT TRINITY HAS
─────────────────────────────────────────────────────────────
Identity       ERC-8004 NFT passport          Architecture (Base Sepolia pending)
Trust          AgentCard on IPFS              Schema + generator BUILT ✓
Money          x402 micropayments             Mock AgentWallet BUILT ✓
Reputation     Proof of Transaction gating    submitRating() + payment_proof_hash BUILT ✓
Justice        DON/TEE/DAO governance         VERITAS + BFT + ZKP (partial) ✓
```

The only missing column is the Base Sepolia deployment — which is gated on P-011 being filed first. File the patent, then deploy.

**φ = 1.61803398875 · ε = 1e-8 · 11 filings · 4 rings · Micah 6:8**
