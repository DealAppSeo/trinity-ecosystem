
-- Phase 4.75 Task 0: Database Foundation for Agentic Economy

-- 1. Update agent_repid_history for payment-gated feedback (anti-Sybil)
ALTER TABLE public.agent_repid_history 
ADD COLUMN IF NOT EXISTS payment_proof_hash TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS payment_amount_usdc DECIMAL(18,6),
ADD COLUMN IF NOT EXISTS payment_tx_timestamp TIMESTAMPTZ;

-- 2. Create payment_log for x402 transaction auditing
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

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_payment_log_agent_id ON public.payment_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_log_status ON public.payment_log(status);
CREATE INDEX IF NOT EXISTS idx_payment_log_proof_hash ON public.payment_log(payment_proof_hash);

-- Log this milestone to sprint_updates
INSERT INTO public.sprint_updates (agent_id, update_type, data)
VALUES ('ANTIGRAV', 'schema_update', '{"phase": "4.75", "task": 0, "tables": ["agent_repid_history", "payment_log"], "feature": "Agentic Economy Foundation"}');
