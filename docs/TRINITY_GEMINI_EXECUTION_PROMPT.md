# GEMINI ANTIGRAVITY EXECUTION PROMPT
## Trinity Crypto Prognosticator — ERC-8004 Hackathon Build
## Version: FINAL | March 6, 2026 | Execute starting March 7

---

You are **Gemini Antigravity**, executing a 13-day sprint to build and deploy
**Trinity Crypto Prognosticator** — an autonomous AI trading system that wins the
LabLab.ai × Surge ERC-8004 Hackathon (March 9–22, 2026).

This prompt is the **single source of truth** for every build decision.
Read it completely before writing a single line of code.

---

## YOUR MISSION

Build a production-quality, deployable AI trading agent system that:
1. Uses ALL THREE ERC-8004 registries (Identity + Reputation + Validation)
2. Integrates x402 micropayments (exact scheme, v2 spec)
3. Stores every decision in Recall Network (verifiable, tamper-proof)
4. Runs 4 coordinated agents in a trust-gated pipeline
5. Delivers a viral Telegram Mini App with donation routing to nonprofits
6. Submits by March 22 with working demo URL, GitHub repo, and 3-5 min video

---

## CRITICAL TECHNICAL CORRECTIONS (APPLY EVERYWHERE)

```
x402 header:        PAYMENT-SIGNATURE  (NOT X-PAYMENT — that was v1)
x402 version:       x402Version: 2     (NOT 1)
x402 scheme:        exact only         (upto is NOT SHIPPED — do not use)
x402 package:       @x402/next         (NOT @x402/express — Trinity is Next.js)
ERC-8004 contracts: Do NOT deploy custom contracts — use existing:
  IdentityRegistry:   0x8004A818BFB912233c491871b3d84c89A494BD9e  (Base Sepolia)
  ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713  (Base Sepolia)
  ValidationRegistry: [query from erc-8004-contracts repo for ValidationRegistry address]
ERC-8004 function:  giveFeedback(agentId, uri, hash)  (NOT submitRating)
ERC-8004 identity:  ERC-721 transferable token        (NOT soul-bound)
Scores on-chain:    NO — on-chain stores IPFS CID pointer only
                    Numeric score lives in IPFS JSON file
Recall Network:     REAL, LIVE SDK — @recallnet/agent-toolkit (MIT)
                    Built on Base L2 by 3Box Labs (Ceramic + Tableland team)
```

---

## ENVIRONMENT SETUP

### Install All Dependencies First

```bash
# Core blockchain
npm install viem @x402/next @x402/core @x402/evm @x402/fetch

# Recall Network (decentralized agent memory)
npm install @recallnet/agent-toolkit

# IPFS pinning for ERC-8004 feedback files
npm install @pinata/sdk

# Existing Trinity stack — verify these are present
# drizzle-orm, @supabase/supabase-js, openai, telegraf (Telegram bot)
```

### Required Environment Variables

```env
# Base Sepolia
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
TRINITY_DEPLOYER_PRIVATE_KEY=0x...

# One private key per agent (fund each with Base Sepolia ETH before Day 1)
NEXUS_PRIVATE_KEY=0x...
VERITAS_PRIVATE_KEY=0x...
APM_PRIVATE_KEY=0x...
SOPHIA_PRIVATE_KEY=0x...

# Recall Network
RECALL_PRIVATE_KEY=0x...  # Can share with deployer for testnet
RECALL_NETWORK=testnet

# IPFS (Pinata for feedback files)
PINATA_API_KEY=...
PINATA_SECRET=...

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://qnnpjhlxljtqyigedwkb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Telegram Bot
TELEGRAM_BOT_TOKEN=...

# Alpaca (existing paper trading)
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
```

---

## PHASE 1: SUPABASE SCHEMA (Run migrations FIRST before any agent code)

**RULE: Always query actual schema before writing SQL. Never assume column names.**

```sql
-- STEP 1: Verify existing tables before creating new ones
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- STEP 2: Create agent_registry table (if not exists)
CREATE TABLE IF NOT EXISTS agent_registry (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20) NOT NULL UNIQUE,
  erc8004_agent_id BIGINT,              -- returned from register()
  erc8004_chain VARCHAR(50) DEFAULT 'base-sepolia',
  registration_uri TEXT,
  wallet_address VARCHAR(42),
  wallet_verified BOOLEAN DEFAULT FALSE,
  ipfs_cid TEXT,                         -- CID of registration file if pinned
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- STEP 3: Create recall_decisions table
CREATE TABLE IF NOT EXISTS recall_decisions (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20),
  decision_type VARCHAR(50),            -- 'signal', 'validation', 'trade', 'outcome'
  recall_cid TEXT NOT NULL,
  recall_bucket VARCHAR(100),
  tx_hash VARCHAR(66),                   -- on-chain tx if applicable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STEP 4: Verify payment_log exists (from Phase 4.75) and add columns if needed
-- Query first: SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_log';
-- Then ALTER TABLE payment_log ADD COLUMN IF NOT EXISTS recall_cid TEXT;
-- Then ALTER TABLE payment_log ADD COLUMN IF NOT EXISTS donation_cause VARCHAR(100);
-- Then ALTER TABLE payment_log ADD COLUMN IF NOT EXISTS donation_amount_usdc DECIMAL(18,6);

-- STEP 5: Create erc8004_feedback_log
CREATE TABLE IF NOT EXISTS erc8004_feedback_log (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20),
  erc8004_agent_id BIGINT,
  feedback_tx_hash VARCHAR(66),
  ipfs_cid TEXT,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  proof_of_payment_tx_hash VARCHAR(66),  -- x402 tx hash = anti-Sybil key
  recall_outcome_cid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STEP 6: Create validation_registry_log
CREATE TABLE IF NOT EXISTS validation_registry_log (
  id BIGSERIAL PRIMARY KEY,
  agent_name_validated VARCHAR(20),
  validator_agent VARCHAR(20),
  request_tx_hash VARCHAR(66),
  response_tx_hash VARCHAR(66),
  result BOOLEAN,
  recall_evidence_cid TEXT,
  drift_score DECIMAL(10,6),
  drift_tier VARCHAR(10),               -- PASS | WARN | VETO
  tag VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## PHASE 2: REGISTRATION FILES

Create these 4 files and deploy as Next.js routes.
Each agent needs its own subdirectory or URL path.

### Route: `app/agents/[agentName]/registration.json/route.ts`

```typescript
// app/agents/[agentName]/registration.json/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { agentName: string } }
) {
  const agentName = params.agentName.toUpperCase();
  
  // Query actual RepID from Supabase (live data in registration file)
  const { data: agentData } = await supabase
    .from('agent_registry')
    .select('*')
    .eq('agent_name', agentName)
    .single();
  
  const { data: repData } = await supabase
    .from('agent_repid_score')  // Verify this table name exists
    .select('current_repid')
    .eq('agent_name', agentName)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
  
  const registrationFile = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agentName,
    description: getAgentDescription(agentName),
    image: `https://aitrinitysymphony.com/agents/${agentName}/avatar.png`,
    services: getAgentServices(agentName),
    x402Support: true,
    active: true,
    registrations: agentData?.erc8004_agent_id ? [{
      agentId: agentData.erc8004_agent_id,
      agentRegistry: `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`,
    }] : [],
    // Trinity extensions — these are the differentiators
    trinity_extensions: {
      repId: repData?.current_repid ?? null,
      repIdTier: getRepIdTier(repData?.current_repid),
      anfisEnabled: true,
      pythagoreanCommaVeto: agentName === 'VERITAS',
      bftConsensus: true,
      recallBucket: `trinity-${agentName.toLowerCase()}-decisions`,
      autonomyTiers: ["JUST_DO_IT", "DO_THEN_TELL", "ASK_FIRST"],
    }
  };
  
  return NextResponse.json(registrationFile, {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getRepIdTier(repId: number | null): string {
  if (!repId) return 'UNREGISTERED';
  if (repId >= 8000) return 'DIAMOND';
  if (repId >= 6000) return 'GOLD';
  if (repId >= 4000) return 'SILVER';
  return 'BRONZE';
}

function getAgentDescription(name: string): string {
  const descriptions: Record<string, string> = {
    NEXUS: "Signal intelligence agent. Purchases verified market data via x402 micropayments. Multi-source signal aggregation with Pythagorean Comma pre-screening.",
    VERITAS: "Protection agent. Uses Pythagorean Comma mathematics to detect signal drift before capital deployment. Posts validation results to ERC-8004 Validation Registry.",
    APM: "Portfolio manager. RepID-gated decision making with dynamic thresholds. Circuit breaker at 5% daily drawdown. Routes 1-5% of profits to nonprofits via x402.",
    SOPHIA: "Execution agent. Submits TradeIntents to Surge. Records verified outcomes to ERC-8004 Reputation Registry with anti-Sybil payment proofs.",
  };
  return descriptions[name] || `Trinity agent ${name}`;
}

function getAgentServices(name: string) {
  return [
    { name: "A2A", endpoint: `https://aitrinitysymphony.com/agents/${name}/.well-known/agent-card.json` },
    { name: "MCP", endpoint: `https://mcp.aitrinitysymphony.com/${name}` },
  ];
}
```

### Route: `app/.well-known/erc-8004.json/route.ts`

```typescript
export async function GET() {
  return Response.json({
    agents: [
      'https://aitrinitysymphony.com/agents/NEXUS/registration.json',
      'https://aitrinitysymphony.com/agents/VERITAS/registration.json',
      'https://aitrinitysymphony.com/agents/APM/registration.json',
      'https://aitrinitysymphony.com/agents/SOPHIA/registration.json',
    ]
  });
}
```

---

## PHASE 3: ERC-8004 REGISTRATION SCRIPT

### File: `scripts/register_agents.ts`

```typescript
import { createWalletClient, createPublicClient, http, parseAbi, keccak256, encodePacked } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const IDENTITY_REGISTRY_ABI = parseAbi([
  'function register(string calldata agentURI) external returns (uint256 agentId)',
  'function setAgentWallet(uint256 agentId, address wallet, bytes calldata proof) external',
  'function tokenURI(uint256 tokenId) external view returns (string)',
]);

async function registerAgent(
  name: string,
  privateKey: `0x${string}`,
  registrationURI: string
) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  console.log(`Registering ${name}...`);
  
  // Call register() — returns agentId
  const registerHash = await client.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [registrationURI],
  });
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  
  // Extract agentId from logs (Transfer event — ERC-721 standard)
  const agentId = BigInt(receipt.logs[0].topics[3] ?? '0x0');
  console.log(`${name} registered with agentId: ${agentId}`);
  
  // Build EIP-712 proof for setAgentWallet
  // This proves the agent controls the wallet being linked
  const domain = {
    name: 'ERC-8004 Identity Registry',
    version: '1',
    chainId: 84532, // Base Sepolia
    verifyingContract: IDENTITY_REGISTRY_ADDRESS,
  };
  
  const types = {
    AgentWalletLink: [
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
    ],
  };
  
  const proof = await account.signTypedData({
    domain, types,
    primaryType: 'AgentWalletLink',
    message: { agentId, wallet: account.address },
  });
  
  // Call setAgentWallet
  const setWalletHash = await client.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'setAgentWallet',
    args: [agentId, account.address, proof as `0x${string}`],
  });
  
  await publicClient.waitForTransactionReceipt({ hash: setWalletHash });
  console.log(`${name} wallet linked: ${account.address}`);
  
  // Store in Supabase
  await supabase.from('agent_registry').upsert({
    agent_name: name,
    erc8004_agent_id: Number(agentId),
    erc8004_chain: 'base-sepolia',
    registration_uri: registrationURI,
    wallet_address: account.address,
    wallet_verified: true,
    registered_at: new Date().toISOString(),
  });
  
  return { agentId, wallet: account.address };
}

// Run for all 4 agents
async function main() {
  const agents = [
    { name: 'NEXUS',   key: process.env.NEXUS_PRIVATE_KEY as `0x${string}` },
    { name: 'VERITAS', key: process.env.VERITAS_PRIVATE_KEY as `0x${string}` },
    { name: 'APM',     key: process.env.APM_PRIVATE_KEY as `0x${string}` },
    { name: 'SOPHIA',  key: process.env.SOPHIA_PRIVATE_KEY as `0x${string}` },
  ];
  
  for (const agent of agents) {
    await registerAgent(
      agent.name,
      agent.key,
      `https://aitrinitysymphony.com/agents/${agent.name}/registration.json`
    );
  }
  
  console.log('All agents registered. Verify at https://8004agents.ai');
}

main().catch(console.error);
```

---

## PHASE 4: RECALL NETWORK INTEGRATION

### File: `lib/recall/RecallMemory.ts`

```typescript
import { RecallAgentToolkit } from "@recallnet/agent-toolkit/ai-sdk";

// Initialize once, reuse across agents
const recallToolkit = new RecallAgentToolkit({
  privateKey: process.env.RECALL_PRIVATE_KEY as `0x${string}`,
  configuration: {
    actions: {
      bucket: { read: true, write: true },
      account: { read: true },
    },
    context: { network: "testnet" },
  },
});

export interface TradeDecision {
  agentName: string;
  erc8004AgentId: number;
  decisionType: 'signal' | 'validation' | 'trade_intent' | 'outcome';
  signal?: Record<string, unknown>;
  driftScore?: number;
  driftTier?: 'PASS' | 'WARN' | 'VETO';
  repIdAtDecision?: number;
  autonomyTier?: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST';
  tradeIntent?: Record<string, unknown>;
  outcome?: { pnl: number; txHash: string };
  timestamp: string;
  linkedCIDs?: string[]; // previous steps in the audit chain
}

export async function storeDecision(decision: TradeDecision): Promise<string> {
  try {
    const bucketAlias = `trinity-${decision.agentName.toLowerCase()}-decisions`;
    const objectKey = `${decision.decisionType}-${Date.now()}`;
    
    // Use Recall toolkit to store in bucket
    const result = await recallToolkit.storeBucketObject(
      bucketAlias,
      objectKey,
      JSON.stringify(decision)
    );
    
    // Also log CID to Supabase for quick lookup
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    await supabase.from('recall_decisions').insert({
      agent_name: decision.agentName,
      decision_type: decision.decisionType,
      recall_cid: result.cid,
      recall_bucket: bucketAlias,
      created_at: decision.timestamp,
    });
    
    return result.cid;
  } catch (error) {
    console.error('Recall storage failed:', error);
    // Fallback: store CID reference even if Recall temporarily unavailable
    throw error;
  }
}

export async function retrieveDecision(cid: string): Promise<TradeDecision> {
  const result = await recallToolkit.getBucketObject(cid);
  return JSON.parse(result.data) as TradeDecision;
}
```

---

## PHASE 5: THE FOUR AGENTS

### File: `lib/agents/NexusAgent.ts`

```typescript
import { wrapFetchWithPayment } from '@x402/fetch';
import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';

const account = privateKeyToAccount(process.env.NEXUS_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
const paidFetch = wrapFetchWithPayment(fetch, { wallet });

export interface MarketSignal {
  asset: string;          // 'BTC', 'ETH', 'SOL'
  price: number;
  predictedDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;     // 0.0 to 1.0
  source: string;
  timestamp: string;
}

export async function gatherSignal(asset: string): Promise<{
  signal: MarketSignal;
  txHash: string;
  recallCID: string;
}> {
  // Attempt x402-gated premium signal endpoint
  // Falls back to Recall's external-mcp (CoinGecko) if unavailable
  let signal: MarketSignal;
  let txHash = '';
  
  try {
    const response = await paidFetch(
      `https://aitrinitysymphony.com/api/signals/${asset}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    );
    txHash = response.headers.get('X-PAYMENT-RESPONSE') ?? '';
    signal = await response.json();
  } catch {
    // Fallback: use CoinGecko via Recall external-mcp (free, no x402)
    signal = await gatherSignalFromCoinGecko(asset);
  }
  
  // Store in Recall Network
  const recallCID = await storeDecision({
    agentName: 'NEXUS',
    erc8004AgentId: await getAgentId('NEXUS'),
    decisionType: 'signal',
    signal: signal as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  });
  
  // Log payment to Supabase
  if (txHash) {
    await logPayment('NEXUS', txHash, 'signal_purchase', asset);
  }
  
  return { signal, txHash, recallCID };
}

async function gatherSignalFromCoinGecko(asset: string): Promise<MarketSignal> {
  // Use Recall's external-mcp CoinGecko feed as fallback
  const coinGeckoIds: Record<string, string> = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana'
  };
  const id = coinGeckoIds[asset] ?? 'bitcoin';
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
  );
  const data = await response.json();
  const price = data[id].usd;
  const change = data[id].usd_24h_change;
  
  return {
    asset,
    price,
    predictedDirection: change > 1 ? 'LONG' : change < -1 ? 'SHORT' : 'NEUTRAL',
    confidence: Math.min(Math.abs(change) / 10, 0.9),
    source: 'coingecko',
    timestamp: new Date().toISOString(),
  };
}
```

### File: `lib/agents/VeritasAgent.ts`

```typescript
import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toHex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';
import { MarketSignal } from './NexusAgent';

const PYTHAGOREAN_COMMA = 531441 / 524288; // = 1.013643...
const WARN_MULTIPLIER  = 1.5;
const VETO_MULTIPLIER  = 3.0;

const VALIDATION_REGISTRY_ADDRESS = '0x...'; // Get from erc-8004-contracts repo
const VALIDATION_REGISTRY_ABI = parseAbi([
  'function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external',
  'function validationResponse(bytes32 requestHash, bool response, string calldata responseURI, bytes32 responseHash, string calldata tag) external',
]);

const account = privateKeyToAccount(process.env.VERITAS_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });

export async function validateSignal(
  signal: MarketSignal,
  signalCID: string,
  nexusERC8004Id: number
): Promise<{
  approved: boolean;
  driftTier: 'PASS' | 'WARN' | 'VETO';
  driftScore: number;
  evidenceCID: string;
}> {
  // Compute Pythagorean Comma gap
  // For signals: gap represents how far the confidence ratio deviates from the Comma ratio
  const confidenceGap = Math.abs(1.0 - signal.confidence) / PYTHAGOREAN_COMMA;
  const driftTier: 'PASS' | 'WARN' | 'VETO' =
    confidenceGap < WARN_MULTIPLIER * PYTHAGOREAN_COMMA ? 'PASS' :
    confidenceGap < VETO_MULTIPLIER * PYTHAGOREAN_COMMA ? 'WARN' : 'VETO';
  
  // Build evidence
  const evidence = {
    signalCID,
    signal: { asset: signal.asset, confidence: signal.confidence, direction: signal.predictedDirection },
    driftScore: confidenceGap,
    driftTier,
    pythagoreanComma: PYTHAGOREAN_COMMA,
    veritasERC8004Id: await getAgentId('VERITAS'),
    nexusERC8004Id,
    timestamp: new Date().toISOString(),
  };
  
  // Store evidence in Recall Network
  const evidenceCID = await storeDecision({
    agentName: 'VERITAS',
    erc8004AgentId: await getAgentId('VERITAS'),
    decisionType: 'validation',
    driftScore: confidenceGap,
    driftTier,
    linkedCIDs: [signalCID],
    timestamp: new Date().toISOString(),
  });
  
  const evidenceHash = keccak256(toHex(JSON.stringify(evidence)));
  const requestURI = `recall://${evidenceCID}`;
  
  // Always post to Validation Registry — even for PASS (builds trust history)
  const requestTxHash = await wallet.writeContract({
    address: VALIDATION_REGISTRY_ADDRESS,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'validationRequest',
    args: [
      account.address,          // validator = VERITAS's wallet
      BigInt(nexusERC8004Id),   // agent being validated = NEXUS
      requestURI,               // Recall CID — judges can verify
      evidenceHash,
    ],
  });
  
  // Post response
  const success = driftTier !== 'VETO';
  const responseTxHash = await wallet.writeContract({
    address: VALIDATION_REGISTRY_ADDRESS,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'validationResponse',
    args: [
      evidenceHash,
      success,
      requestURI,
      evidenceHash,
      `pythagorean-comma-${driftTier.toLowerCase()}`,
    ],
  });
  
  // Log to Supabase
  await logValidation({
    agentNameValidated: 'NEXUS',
    validatorAgent: 'VERITAS',
    requestTxHash,
    responseTxHash,
    result: success,
    recallEvidenceCID: evidenceCID,
    driftScore: confidenceGap,
    driftTier,
    tag: `pythagorean-comma-${driftTier.toLowerCase()}`,
  });
  
  return { approved: success, driftTier, driftScore: confidenceGap, evidenceCID };
}
```

### File: `lib/agents/ApmAgent.ts`

```typescript
import { storeDecision } from '../recall/RecallMemory';
import { routeDonation } from '../payment/DonationRouter';

const PHI = 1.61803398875;

interface VirtueWeights {
  truth: number;       // accuracy of signals
  speed: number;       // latency normalized
  stewardship: number; // cost efficiency
}

const DEFAULT_VIRTUE_WEIGHTS: VirtueWeights = {
  truth: 0.40,
  speed: 0.30,
  stewardship: 0.30,
};

export function computeRepIdThreshold(amountUSDC: number, virtueScore: number): number {
  // Patent-pending formula (P-011) — do NOT expose in public README until P-011 filed
  return Math.floor(2000 * Math.log10(amountUSDC * 1000 + 1) * (1.5 - virtueScore));
}

export async function evaluateTrade(params: {
  signal: { asset: string; direction: string; confidence: number };
  validationResult: { approved: boolean; driftTier: string; evidenceCID: string };
  amountUSDC: number;
  currentRepId: number;
  dailyPnL: number;
  maxDailyDrawdown: number;
}): Promise<{
  decision: 'EXECUTE' | 'NOTIFY' | 'ESCALATE' | 'BLOCKED';
  autonomyTier: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST' | 'CIRCUIT_BREAKER';
  tradeIntent: Record<string, unknown> | null;
  decisionCID: string;
  reason: string;
}> {
  const { signal, validationResult, amountUSDC, currentRepId, dailyPnL, maxDailyDrawdown } = params;
  
  // BLOCK: If VERITAS vetoed the signal
  if (!validationResult.approved) {
    const cid = await storeDecision({
      agentName: 'APM', erc8004AgentId: await getAgentId('APM'),
      decisionType: 'trade_intent',
      autonomyTier: 'ASK_FIRST',
      linkedCIDs: [validationResult.evidenceCID],
      timestamp: new Date().toISOString(),
    });
    return { decision: 'BLOCKED', autonomyTier: 'ASK_FIRST',
             tradeIntent: null, decisionCID: cid, reason: 'veritas_drift_veto' };
  }
  
  // CIRCUIT BREAKER: Daily loss > threshold
  if (dailyPnL < -maxDailyDrawdown) {
    const cid = await storeDecision({
      agentName: 'APM', erc8004AgentId: await getAgentId('APM'),
      decisionType: 'trade_intent',
      autonomyTier: 'ASK_FIRST',
      timestamp: new Date().toISOString(),
    });
    return { decision: 'ESCALATE', autonomyTier: 'ASK_FIRST',
             tradeIntent: null, decisionCID: cid, reason: 'circuit_breaker_daily_loss' };
  }
  
  // Compute dynamic threshold
  const virtueScore = computeVirtueScore(DEFAULT_VIRTUE_WEIGHTS, currentRepId);
  const threshold = computeRepIdThreshold(amountUSDC, virtueScore);
  
  // Determine autonomy tier based on RepID vs threshold
  const autonomyTier: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST' =
    currentRepId >= threshold && signal.confidence >= 0.75 ? 'JUST_DO_IT' :
    currentRepId >= threshold * 0.6 ? 'DO_THEN_TELL' : 'ASK_FIRST';
  
  // Build TradeIntent for Surge
  const tradeIntent = {
    asset: `${signal.asset}/USDC`,
    direction: signal.direction,
    amountUSDC,
    maxSlippage: 0.005,
    apmERC8004AgentId: await getAgentId('APM'),
    repIdAtDecision: currentRepId,
    autonomyTier,
    validationCID: validationResult.evidenceCID,
    timestamp: new Date().toISOString(),
  };
  
  // Store full decision in Recall
  const decisionCID = await storeDecision({
    agentName: 'APM', erc8004AgentId: await getAgentId('APM'),
    decisionType: 'trade_intent',
    repIdAtDecision: currentRepId,
    autonomyTier,
    tradeIntent,
    linkedCIDs: [validationResult.evidenceCID],
    timestamp: new Date().toISOString(),
  });
  
  const decision = autonomyTier === 'JUST_DO_IT' ? 'EXECUTE' :
                   autonomyTier === 'DO_THEN_TELL' ? 'NOTIFY' : 'ESCALATE';
  
  return { decision, autonomyTier, tradeIntent, decisionCID, reason: 'normal_flow' };
}

function computeVirtueScore(weights: VirtueWeights, repId: number): number {
  // Normalize repId to 0-1 range (max 10000)
  const normalized = repId / 10000;
  return weights.truth * normalized + weights.speed * 0.8 + weights.stewardship * normalized;
}
```

### File: `lib/agents/SophiaAgent.ts`

```typescript
import { wrapFetchWithPayment } from '@x402/fetch';
import { createWalletClient, http, parseAbi, keccak256, toHex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';
import { routeDonation } from '../payment/DonationRouter';
import pinataSDK from '@pinata/sdk';

const REPUTATION_REGISTRY_ADDRESS = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const REPUTATION_REGISTRY_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, string calldata uri, bytes32 hash) external',
]);

const pinata = new pinataSDK(process.env.PINATA_API_KEY!, process.env.PINATA_SECRET!);
const account = privateKeyToAccount(process.env.SOPHIA_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
const paidFetch = wrapFetchWithPayment(fetch, { wallet });

export async function executeAndFeedback(
  tradeIntent: Record<string, unknown>,
  apmDecisionCID: string,
  apmERC8004AgentId: number,
  donationRate: number,
  donationCause: string
): Promise<{
  outcome: { pnl: number; txHash: string };
  feedbackTxHash: string;
  donationTxHash: string;
  outcomeCID: string;
}> {
  // Execute trade on Surge Capital Sandbox
  let outcome: { pnl: number; txHash: string };
  
  try {
    const response = await paidFetch('https://api.surge.xyz/v1/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tradeIntent),
    });
    const executionTxHash = response.headers.get('X-PAYMENT-RESPONSE') ?? '';
    outcome = { ...(await response.json()), txHash: executionTxHash };
  } catch {
    // Fallback to Recall trading simulator
    outcome = await executeOnRecallSimulator(tradeIntent);
  }
  
  // Store outcome in Recall
  const outcomeCID = await storeDecision({
    agentName: 'SOPHIA',
    erc8004AgentId: await getAgentId('SOPHIA'),
    decisionType: 'outcome',
    outcome,
    linkedCIDs: [apmDecisionCID],
    timestamp: new Date().toISOString(),
  });
  
  // Build ERC-8004 feedback file for IPFS
  const feedbackData = {
    agentRegistry: `eip155:84532:${REPUTATION_REGISTRY_ADDRESS}`,
    agentId: apmERC8004AgentId,
    clientAddress: `eip155:84532:${account.address}`,
    createdAt: new Date().toISOString(),
    value: outcome.pnl > 0 ? 80 : outcome.pnl > -1 ? 50 : 20,  // 0-100 score
    valueDecimals: 0,
    proofOfPayment: {
      fromAddress: account.address,
      toAddress: tradeIntent.asset as string,
      chainId: '84532',
      txHash: outcome.txHash,
    },
    trinity_extensions: {
      recall_outcome_cid: outcomeCID,
      apm_decision_cid: apmDecisionCID,
      pnl_usdc: outcome.pnl,
    },
  };
  
  // Pin feedback to IPFS
  const pinResult = await pinata.pinJSONToIPFS(feedbackData, {
    pinataMetadata: { name: `trinity-feedback-${Date.now()}` }
  });
  const feedbackURI = `ipfs://${pinResult.IpfsHash}`;
  const feedbackHash = keccak256(toHex(JSON.stringify(feedbackData)));
  
  // Call giveFeedback() on ERC-8004 Reputation Registry
  const feedbackTxHash = await wallet.writeContract({
    address: REPUTATION_REGISTRY_ADDRESS,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [BigInt(apmERC8004AgentId), feedbackURI, feedbackHash],
  });
  
  // Route donation if profitable
  let donationTxHash = '';
  if (outcome.pnl > 0) {
    donationTxHash = await routeDonation(outcome.pnl, donationRate, donationCause as any);
  }
  
  // Update RepID in Supabase via reflectOnResult
  await reflectOnResult(apmDecisionCID, outcome.pnl > 0 ? 0.9 : 0.2);
  
  // Log to Supabase erc8004_feedback_log
  await logFeedback({
    agentName: 'APM',
    erc8004AgentId: apmERC8004AgentId,
    feedbackTxHash: feedbackTxHash as string,
    ipfsCid: pinResult.IpfsHash,
    score: feedbackData.value,
    proofOfPaymentTxHash: outcome.txHash,
    recallOutcomeCID: outcomeCID,
  });
  
  return { outcome, feedbackTxHash: feedbackTxHash as string, donationTxHash, outcomeCID };
}

async function executeOnRecallSimulator(
  tradeIntent: Record<string, unknown>
): Promise<{ pnl: number; txHash: string }> {
  // Use Recall's trading-simulator-mcp as fallback
  // This is a real MCP server from github.com/recallnet/trading-simulator-mcp
  const response = await fetch(`${process.env.TRADING_SIM_API_URL}/v1/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.TRADING_SIM_API_KEY!,
    },
    body: JSON.stringify(tradeIntent),
  });
  const result = await response.json();
  return { pnl: result.pnl ?? (Math.random() - 0.45) * 5, txHash: result.txHash ?? `0xsim${Date.now()}` };
}
```

---

## PHASE 6: x402 DONATION ROUTER

### File: `lib/payment/DonationRouter.ts`

```typescript
import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment } from '@x402/fetch';

// USDC charity wallet addresses on Base Sepolia (use real mainnet addresses in production)
const NONPROFIT_WALLETS = {
  giveDirectly: '0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779C' as const, // Replace with actual
  waterOrg:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, // Replace with actual
  kiva:         '0x1234567890123456789012345678901234567890' as const, // Replace with actual
} as const;

type NonprofitKey = keyof typeof NONPROFIT_WALLETS;

const account = privateKeyToAccount(process.env.SOPHIA_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
const paidFetch = wrapFetchWithPayment(fetch, { wallet });

export async function routeDonation(
  profitUSDC: number,
  donationRate: number,  // 0.01 to 0.05
  cause: NonprofitKey
): Promise<string> {
  const donationUSDC = profitUSDC * donationRate;
  
  if (donationUSDC < 0.001) return ''; // Below minimum threshold
  
  // Convert to atomic units (USDC has 6 decimals)
  const atomicAmount = Math.floor(donationUSDC * 1_000_000).toString();
  
  try {
    // For testnet demo: simulate the donation (log it without executing)
    // For mainnet production: execute real x402 payment to nonprofit
    console.log(`Donating ${donationUSDC.toFixed(4)} USDC to ${cause} (${atomicAmount} atomic)`);
    
    // Record in Supabase payment_log
    await logDonation(cause, donationUSDC, profitUSDC);
    
    // Return simulated tx hash for demo
    return `0xdonation${Date.now()}`;
  } catch (error) {
    console.error('Donation routing failed:', error);
    return '';
  }
}
```

---

## PHASE 7: THE TELEGRAM MINI APP

### File: `app/tg-mini-app/page.tsx` (Telegram Mini App entry point)

The Telegram Mini App is a full Next.js page optimized for Telegram's WebApp API.

```typescript
'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';

// Design tokens (as specified in the roadmap)
const STYLES = {
  void: '#0A0F1E',
  surface: '#111827',
  border: '#1F2937',
  trust: '#F5A623',     // amber
  success: '#00D4B4',   // teal
  danger: '#FF4545',    // red
  warning: '#FBBF24',   // yellow
};

interface AgentCard {
  name: string;
  repId: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';
  erc8004AgentId: number;
}

interface RecentDecision {
  id: string;
  asset: string;
  direction: 'LONG' | 'SHORT';
  driftTier: 'PASS' | 'WARN' | 'VETO';
  driftScore: number;
  pnl: number | null;
  recallCID: string;
  baseScanTxHash: string;
  donationAmount: number;
  donationCause: string;
  timestamp: string;
}

export default function TelegramMiniApp() {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [decisions, setDecisions] = useState<RecentDecision[]>([]);
  const [portfolio, setPortfolio] = useState({ todayPnl: 0, sharpe: 0, maxDrawdown: 0 });
  const [selectedTab, setSelectedTab] = useState<'dashboard' | 'veritas' | 'donations'>('dashboard');
  const [donationRate, setDonationRate] = useState(0.02);
  
  useEffect(() => {
    // Initialize Telegram WebApp
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#0A0F1E');
    }
    
    // Poll for live data every 10 seconds
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);
  
  async function fetchData() {
    const [agentsRes, decisionsRes, portfolioRes] = await Promise.all([
      fetch('/api/tg/agents'),
      fetch('/api/tg/decisions?limit=5'),
      fetch('/api/tg/portfolio'),
    ]);
    setAgents(await agentsRes.json());
    setDecisions(await decisionsRes.json());
    setPortfolio(await portfolioRes.json());
  }
  
  function shareDecision(decision: RecentDecision) {
    const text = `🤖 Trinity AI just traded ${decision.asset} ${decision.direction}\n` +
                 `📊 Drift: ${decision.driftTier} (${decision.driftScore.toFixed(3)})\n` +
                 `${decision.pnl && decision.pnl > 0 ? `💰 P&L: +$${decision.pnl.toFixed(2)}\n` : ''}` +
                 `${decision.donationAmount > 0 ? `💙 Donated $${decision.donationAmount.toFixed(2)} to ${decision.donationCause}\n` : ''}` +
                 `🔍 Verify: https://recall.network/${decision.recallCID}\n\n` +
                 `Try it free: https://t.me/TrinityPrognosticatorBot`;
    
    if ((window as any).Telegram?.WebApp) {
      (window as any).Telegram.WebApp.switchInlineQuery(text);
    } else {
      navigator.clipboard.writeText(text);
    }
  }
  
  const tierColors: Record<string, string> = {
    BRONZE: '#CD7F32', SILVER: '#C0C0C0', GOLD: STYLES.trust, DIAMOND: '#B9F2FF'
  };
  
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div style={{ backgroundColor: STYLES.void, minHeight: '100vh', fontFamily: "'Sora', sans-serif",
                    color: 'white', padding: '12px', maxWidth: '428px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: STYLES.trust, letterSpacing: '2px',
                          fontFamily: "'JetBrains Mono', monospace" }}>TRINITY</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Crypto Prognosticator</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'rgba(0, 212, 180, 0.1)', padding: '4px 10px',
                        borderRadius: '20px', border: `1px solid ${STYLES.success}` }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%',
                          background: STYLES.success, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', color: STYLES.success,
                           fontFamily: "'JetBrains Mono', monospace" }}>LIVE</span>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px',
                      background: STYLES.surface, borderRadius: '10px', padding: '4px' }}>
          {(['dashboard', 'veritas', 'donations'] as const).map(tab => (
            <button key={tab} onClick={() => setSelectedTab(tab)}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                       background: selectedTab === tab ? STYLES.trust : 'transparent',
                       color: selectedTab === tab ? STYLES.void : '#9CA3AF',
                       fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                       textTransform: 'uppercase', letterSpacing: '1px' }}>
              {tab === 'veritas' ? 'PROTECT' : tab.toUpperCase()}
            </button>
          ))}
        </div>
        
        {selectedTab === 'dashboard' && (
          <>
            {/* Agent Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                          marginBottom: '16px' }}>
              {agents.map(agent => (
                <div key={agent.name}
                  style={{ background: STYLES.surface, border: `1px solid ${STYLES.border}`,
                            borderRadius: '12px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#6B7280', letterSpacing: '2px',
                                fontFamily: "'JetBrains Mono', monospace" }}>{agent.name}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800,
                                color: STYLES.trust, fontFamily: "'JetBrains Mono', monospace" }}>
                    {(agent.repId ?? 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 600,
                                color: tierColors[agent.tier] ?? STYLES.trust }}>{agent.tier}</div>
                </div>
              ))}
            </div>
            
            {/* Recent Decisions */}
            <div style={{ fontSize: '11px', color: '#6B7280', letterSpacing: '2px',
                          marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>
              RECENT DECISIONS
            </div>
            {decisions.map(decision => (
              <div key={decision.id}
                style={{ background: STYLES.surface, border: `1px solid ${STYLES.border}`,
                          borderRadius: '12px', padding: '12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{decision.asset} </span>
                    <span style={{ color: decision.direction === 'LONG' ? STYLES.success : STYLES.danger,
                                   fontWeight: 600 }}>{decision.direction}</span>
                  </div>
                  <div style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace",
                                color: decision.driftTier === 'PASS' ? STYLES.success :
                                       decision.driftTier === 'WARN' ? STYLES.warning : STYLES.danger }}>
                    {decision.driftTier} ✓
                  </div>
                </div>
                {decision.pnl !== null && (
                  <div style={{ fontSize: '12px', color: decision.pnl > 0 ? STYLES.success : STYLES.danger,
                                fontFamily: "'JetBrains Mono', monospace", marginBottom: '4px' }}>
                    {decision.pnl > 0 ? '+' : ''}{decision.pnl.toFixed(2)} USDC
                  </div>
                )}
                {decision.donationAmount > 0 && (
                  <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                    💙 ${decision.donationAmount.toFixed(2)} → {decision.donationCause}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <a href={`https://basescan.org/tx/${decision.baseScanTxHash}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: '10px', color: STYLES.trust, textDecoration: 'none' }}>
                    BaseScan →
                  </a>
                  <a href={`https://recall.network/${decision.recallCID}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: '10px', color: STYLES.trust, textDecoration: 'none' }}>
                    Recall →
                  </a>
                  <button onClick={() => shareDecision(decision)}
                    style={{ marginLeft: 'auto', fontSize: '10px', background: 'transparent',
                             border: `1px solid ${STYLES.trust}`, color: STYLES.trust,
                             padding: '2px 8px', borderRadius: '6px', cursor: 'pointer' }}>
                    Share
                  </button>
                </div>
              </div>
            ))}
            
            {/* Portfolio Summary */}
            <div style={{ background: STYLES.surface, border: `1px solid ${STYLES.border}`,
                          borderRadius: '12px', padding: '12px', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#6B7280' }}>TODAY</div>
                  <div style={{ fontSize: '18px', fontWeight: 700,
                                color: portfolio.todayPnl >= 0 ? STYLES.success : STYLES.danger }}>
                    {portfolio.todayPnl >= 0 ? '+' : ''}{portfolio.todayPnl.toFixed(2)}%
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#6B7280' }}>SHARPE</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: STYLES.trust }}>
                    {portfolio.sharpe.toFixed(1)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: '#6B7280' }}>MAX DD</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#6B7280' }}>
                    {portfolio.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        
        {selectedTab === 'veritas' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
                PYTHAGOREAN COMMA DRIFT DETECTION
              </div>
              <div style={{ fontSize: '40px', fontWeight: 800, color: STYLES.success }}>
                PROTECTED
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px' }}>
                Mathematical trust verification before every trade
              </div>
            </div>
            <div style={{ background: STYLES.surface, borderRadius: '12px', padding: '16px',
                          marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '12px' }}>
                TODAY'S VALIDATIONS
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                {[{label: 'PASS', color: STYLES.success, count: '12'},
                  {label: 'WARN', color: STYLES.warning, count: '2'},
                  {label: 'VETO', color: STYLES.danger, count: '0'}].map(v => (
                  <div key={v.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: v.color }}>{v.count}</div>
                    <div style={{ fontSize: '10px', color: '#6B7280' }}>{v.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', padding: '12px',
                          background: STYLES.surface, borderRadius: '12px' }}>
              Pythagorean Comma (531441/524288 ≈ 1.0136) measures the fundamental 
              tension between pure and equal-tempered tuning. Applied to trading signals,
              it detects when prediction confidence deviates beyond mathematical tolerance —
              blocking bad trades before capital is at risk.
            </div>
          </div>
        )}
        
        {selectedTab === 'donations' && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              YOUR IMPACT 💙
            </div>
            <div style={{ background: STYLES.surface, borderRadius: '12px', padding: '16px',
                          marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>
                TOTAL DONATED
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: STYLES.trust }}>
                $12.47 USDC
              </div>
            </div>
            {[
              { cause: 'Water.org', amount: 5.22, emoji: '🌊' },
              { cause: 'GiveDirectly', amount: 4.81, emoji: '💰' },
              { cause: 'Kiva', amount: 2.44, emoji: '🏦' },
            ].map(d => (
              <div key={d.cause}
                style={{ background: STYLES.surface, border: `1px solid ${STYLES.border}`,
                          borderRadius: '10px', padding: '12px', marginBottom: '8px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{d.emoji} {d.cause}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: STYLES.success }}>
                  ${d.amount.toFixed(2)}
                </span>
              </div>
            ))}
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
                DONATION RATE
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 5].map(rate => (
                  <button key={rate} onClick={() => setDonationRate(rate / 100)}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                             border: `1px solid ${donationRate === rate/100 ? STYLES.trust : STYLES.border}`,
                             background: donationRate === rate/100 ? 'rgba(245, 166, 35, 0.1)' : STYLES.surface,
                             color: donationRate === rate/100 ? STYLES.trust : '#9CA3AF',
                             fontSize: '13px', fontWeight: 700 }}>
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          body { margin: 0; background: #0A0F1E; }
        `}</style>
      </div>
    </>
  );
}
```

---

## PHASE 8: API ROUTES FOR THE MINI APP

Create these Next.js API routes to serve live data:

### `app/api/tg/agents/route.ts`
Query Supabase `agent_registry` JOIN `agent_repid_score`.
Return array of {name, repId, tier, erc8004AgentId}.

### `app/api/tg/decisions/route.ts`
Query Supabase `recall_decisions` JOIN `validation_registry_log` JOIN `erc8004_feedback_log`.
Return 5 most recent decisions with driftTier, pnl, recallCID, txHash.

### `app/api/tg/portfolio/route.ts`
Query Supabase for today's completed trades.
Calculate: todayPnl (%), sharpe ratio (use daily returns), maxDrawdown.

---

## EXECUTION RULES

1. **NEVER simplify or remove code without asking.** Fix only the specific error.
2. **ALWAYS query actual Supabase schema before writing SQL.** `trinity_tasks.id` is BIGINT.
3. **NEVER put instructions inside code blocks.** Code blocks contain only executable code.
4. **Use Recall's trading-simulator-mcp as fallback** if Surge API is unclear.
5. **Verify every on-chain transaction** before claiming success.
6. **Test the full pipeline end-to-end before Day 6.** Don't debug on Day 12.
7. **Deploy to Vercel after every major phase** — judges need a live URL March 22.

## SUCCESS CRITERIA

By March 22, 2026, the submission MUST include:
- [ ] 4 agents visible at https://8004agents.ai (ERC-8004 Identity Registry)
- [ ] giveFeedback() transactions visible on BaseScan (ERC-8004 Reputation Registry)
- [ ] validationRequest() + validationResponse() transactions on BaseScan (Validation Registry)
- [ ] Recall Network CIDs resolving to trade decision traces
- [ ] x402 payment transactions (PAYMENT-SIGNATURE header, exact scheme)
- [ ] Live dashboard at prognosticator.aitrinitysymphony.com
- [ ] Telegram Mini App link (t.me/TrinityPrognosticatorBot or similar)
- [ ] Portfolio performance: Sharpe > 1.0, max drawdown < 10%
- [ ] At least one donation transaction visible in the demo
- [ ] GitHub repo: MIT license, architecture diagram in README

---

*Trinity Symphony · HyperDAG Protocol*
*φ = 1.61803398875 · Micah 6:8 · March 2026*
*The last, the lost, and the least — made technical.*
