-- ================================================
-- TRINITY SYMPHONY SCHEMA v3.1 — SECTION F
-- Run AFTER all previous sections complete
-- ================================================

-- SECTION F: INDEXES
-- Composite indexes for high-frequency query paths
-- ============================================================

-- Core prediction query paths
CREATE INDEX IF NOT EXISTS idx_regimes_type_detected
  ON prediction_regimes(regime_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_regimes_lle
  ON prediction_regimes(lle_value) WHERE lle_value > 0.03;

CREATE INDEX IF NOT EXISTS idx_signals_cycle_agent_asset
  ON prediction_signals(cycle_id, agent_id, asset);

CREATE INDEX IF NOT EXISTS idx_signals_asset_detected
  ON prediction_signals(asset, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_hallucination
  ON prediction_signals(hallucination_risk) WHERE hallucination_risk = 'HIGH';

CREATE INDEX IF NOT EXISTS idx_consensus_asset_completed
  ON prediction_consensus(asset, cycle_completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_consensus_reverse_cascade
  ON prediction_consensus(reverse_cascade_detected, cycle_completed_at DESC)
  WHERE reverse_cascade_detected = TRUE;

CREATE INDEX IF NOT EXISTS idx_consensus_hitl_pending
  ON prediction_consensus(hitl_required, hitl_completed_at)
  WHERE hitl_required = TRUE AND hitl_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outcomes_cycle
  ON prediction_outcomes(cycle_id);

CREATE INDEX IF NOT EXISTS idx_outcomes_asset_recorded
  ON prediction_outcomes(asset, outcome_recorded_at DESC);

-- Agent learning query paths
CREATE INDEX IF NOT EXISTS idx_accuracy_agent_regime
  ON agent_accuracy_matrix(agent_id, regime_type);

CREATE INDEX IF NOT EXISTS idx_capability_agent_modality
  ON agent_capability_scores(agent_id, modality);

CREATE INDEX IF NOT EXISTS idx_capability_eligible
  ON agent_capability_scores(modality, capability_score)
  WHERE capability_score >= 0.58;

CREATE INDEX IF NOT EXISTS idx_peer_lessons_learning_agent
  ON peer_lessons(learning_agent, learned_at DESC);

CREATE INDEX IF NOT EXISTS idx_peer_lessons_expires
  ON peer_lessons(expires_at) WHERE expires_at IS NOT NULL;

-- Wisdom query paths
CREATE INDEX IF NOT EXISTS idx_wisdom_key_correct
  ON historical_wisdom_activations(wisdom_key, was_correct);

CREATE INDEX IF NOT EXISTS idx_wisdom_regime
  ON historical_wisdom_activations(regime_at_time, activated_at DESC);

-- pgvector index for RAG retrieval (postmortems)
CREATE INDEX IF NOT EXISTS idx_postmortems_embedding
  ON prediction_postmortems USING ivfflat (lesson_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Fuzzy text index for wisdom RAG
CREATE INDEX IF NOT EXISTS idx_postmortems_human_tag_trgm
  ON prediction_postmortems USING gin(human_pattern_tag gin_trgm_ops);

-- Intelligence query paths
CREATE INDEX IF NOT EXISTS idx_insider_disclosure_date
  ON insider_trading_signals(disclosure_date DESC);

CREATE INDEX IF NOT EXISTS idx_insider_source_direction
  ON insider_trading_signals(source_type, trade_direction);

CREATE INDEX IF NOT EXISTS idx_insider_crypto_relevance
  ON insider_trading_signals(crypto_relevance DESC)
  WHERE crypto_relevance > 0.60;

CREATE INDEX IF NOT EXISTS idx_bubble_detected
  ON bubble_migration_events(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_bubble_hidden_flow
  ON bubble_migration_events(hidden_flow_suspected, detected_at DESC)
  WHERE hidden_flow_suspected = TRUE;

-- HITL query paths
CREATE INDEX IF NOT EXISTS idx_hunch_operator_category
  ON hitl_hunch_log(operator_id, hunch_category, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunch_override
  ON hitl_hunch_log(override_system, decided_at DESC)
  WHERE override_system = TRUE;

CREATE INDEX IF NOT EXISTS idx_hias_operator_score
  ON human_intuition_scores(operator_id, hias_score DESC);

-- Execution query paths
CREATE INDEX IF NOT EXISTS idx_execution_mode_date
  ON trade_execution_log(execution_mode, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_slippage
  ON trade_execution_log(slippage_pct DESC)
  WHERE slippage_pct > 0.30;


