
-- Phase 4.75 Task 0: Database Foundation for Agentic Economy (Primary Source Alignment)

-- 1. Create agent_repid_history (Official Reputation Ledger)
CREATE TABLE IF NOT EXISTS public.agent_repid_history (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_id TEXT,
    repid_delta INTEGER NOT NULL,
    accuracy_score DECIMAL(5,4),
    payment_proof_hash TEXT UNIQUE NOT NULL, -- Anti-Sybil: Must have hash to write rep
    payment_amount_usdc DECIMAL(18,6),
    payment_tx_timestamp TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create payment_log (x402 Audit Trail)
CREATE TABLE IF NOT EXISTS public.payment_log (
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
                   'VETO_VETO','VETO_EMERGENCY', 'VETO_WARNING', 'HITL_PENDING',
                   'HITL_APPROVED','HITL_REJECTED')
    ),
    chain TEXT NOT NULL DEFAULT 'base',
    delegation_chain JSONB,
    -- Amount-weighted reputation impact (Article 3)
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

-- 3. Create agent_registry (ERC-8004 Identity Tracking)
CREATE TABLE IF NOT EXISTS public.agent_registry (
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

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_repid_history_agent ON public.agent_repid_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_log_agent ON public.payment_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_log_proof_hash ON public.payment_log(payment_proof_hash);

-- Log this milestone
INSERT INTO public.sprint_updates (agent_id, update_type, data)
VALUES ('ANTIGRAV', 'schema_update', '{"phase": "4.75", "task": 0, "feature": "Anti-Sybil Economy Foundation"}');
