-- TRINITY CRYPTO PROGNOSTICATOR: INFRASTRUCTURE INITIALIZATION
-- VERSION: 1.0 (March 6, 2026)

-- 1. Agent Registry: On-chain identity tracking
CREATE TABLE IF NOT EXISTS agent_registry (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20) NOT NULL UNIQUE,
  erc8004_agent_id BIGINT,
  erc8004_chain VARCHAR(50) DEFAULT 'base-sepolia',
  registration_uri TEXT,
  wallet_address VARCHAR(42),
  wallet_verified BOOLEAN DEFAULT FALSE,
  ipfs_cid TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Recall Decisions: content-addressed agent memory
CREATE TABLE IF NOT EXISTS recall_decisions (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20),
  decision_type VARCHAR(50), -- 'signal', 'validation', 'trade_intent', 'outcome'
  recall_cid TEXT NOT NULL,
  recall_bucket VARCHAR(100),
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ERC-8004 Feedback Log: reputation proof loop
CREATE TABLE IF NOT EXISTS erc8004_feedback_log (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20),
  erc8004_agent_id BIGINT,
  feedback_tx_hash VARCHAR(66),
  ipfs_cid TEXT,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  proof_of_payment_tx_hash VARCHAR(66),
  recall_outcome_cid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Validation Registry Log: VERITAS protection events
CREATE TABLE IF NOT EXISTS validation_registry_log (
  id BIGSERIAL PRIMARY KEY,
  agent_name_validated VARCHAR(20),
  validator_agent VARCHAR(20),
  request_tx_hash VARCHAR(66),
  response_tx_hash VARCHAR(66),
  result BOOLEAN,
  recall_evidence_cid TEXT,
  drift_score DECIMAL(10,6),
  drift_tier VARCHAR(10), -- PASS | WARN | VETO
  tag VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Reputation Track: Time-series of RepID scores
-- Check if agent_repid_score exists first (from previous sessions)
CREATE TABLE IF NOT EXISTS agent_repid_score (
  id BIGSERIAL PRIMARY KEY,
  agent_name VARCHAR(20) REFERENCES agent_registry(agent_name),
  current_repid INTEGER DEFAULT 5000,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);
