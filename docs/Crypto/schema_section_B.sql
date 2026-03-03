-- ================================================
-- TRINITY SYMPHONY SCHEMA v3.1 — SECTION B
-- Run AFTER all previous sections complete
-- ================================================

-- SECTION B: CORE PREDICTION TABLES (CRITICAL — BUILD FIRST)
-- ============================================================

-- B1: Regime Classification
-- SOPHIA's output — market regime with LNN state and harmonic alignment
CREATE TABLE IF NOT EXISTS prediction_regimes (
  id                      BIGSERIAL PRIMARY KEY,
  detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regime_type             TEXT NOT NULL,
  -- TRENDING_UP | TRENDING_DOWN | RANGING | LATE_BULL_REVERSAL
  -- NARRATIVE_DRIVEN | RETAIL_FOMO | ACCUMULATION | DISTRIBUTION
  -- SHOCK | TRANSITION | CHAOTIC
  regime_confidence       NUMERIC(5,4) NOT NULL CHECK (regime_confidence BETWEEN 0 AND 1),
  lnn_state               JSONB,              -- LNN internal state snapshot
  harmonic_alignment      TEXT,               -- ALIGNED | PARTIAL | MISALIGNED
  lle_value               NUMERIC(8,6),       -- Lyapunov exponent at detection
  multifractal_width      NUMERIC(8,4),       -- Width of multifractal spectrum
  hurst_short             NUMERIC(5,4),       -- Short-scale Hurst exponent
  hurst_long              NUMERIC(5,4),       -- Long-scale Hurst exponent
  recurrence_entropy      NUMERIC(8,6),       -- RQA entropy — pre-bifurcation signal
  chaos_fractal_score     NUMERIC(8,6),       -- LLE x (H-0.5) x mf_width x rqa_entropy
  sophia_agent_version    TEXT,
  is_reverse_cascade      BOOLEAN DEFAULT FALSE,
  cascade_direction       TEXT,               -- FORWARD | REVERSE | HYBRID
  notes                   TEXT
);

-- B2: Raw Agent Signals
-- One row per agent per prediction cycle
CREATE TABLE IF NOT EXISTS prediction_signals (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID NOT NULL,      -- Groups all agent signals for one cycle
  agent_id                TEXT NOT NULL,
  -- HDM | NEXUS | TORCH | SOPHIA | VERITAS | ANTIGRAV | GCM | TORCH | W3C | APM | MEL
  asset                   TEXT NOT NULL,      -- BTC | ETH | SOL | etc
  detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_direction        TEXT,               -- BULLISH | BEARISH | NEUTRAL | NO_SIGNAL
  signal_confidence       NUMERIC(5,4) CHECK (signal_confidence BETWEEN 0 AND 1),
  confidence_1h           NUMERIC(5,4),       -- Must be >= confidence_4h (monotonic)
  confidence_4h           NUMERIC(5,4),       -- Must be >= confidence_24h
  confidence_24h          NUMERIC(5,4),
  evidence_chain          JSONB,              -- Full evidence supporting signal
  contradicting_evidence  JSONB,             -- Required — null = HIGH hallucination risk
  hallucination_risk      TEXT DEFAULT 'LOW', -- LOW | MEDIUM | HIGH
  source_list             JSONB,              -- Data sources used (for EDM overlap check)
  modality                TEXT,               -- on_chain | sentiment | historical | regime | etc
  role_type               TEXT DEFAULT 'PRIMARY', -- PRIMARY | SECONDARY | HISTORICAL
  capability_score_used   NUMERIC(5,4),       -- Agent's earned score for this modality
  wisdom_keys_activated   JSONB,              -- Which wisdom entries fired this cycle
  comma_delta             NUMERIC(8,4),       -- Pythagorean gap at signal time
  regime_id               BIGINT REFERENCES prediction_regimes(id)
);

-- B3: BFT Consensus Round
-- One row per prediction cycle — the final ensemble output
CREATE TABLE IF NOT EXISTS prediction_consensus (
  cycle_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cycle_completed_at      TIMESTAMPTZ,
  asset                   TEXT NOT NULL,
  regime_id               BIGINT REFERENCES prediction_regimes(id),

  -- BFT Voting
  bft_votes               JSONB,              -- {agent_id: vote} for all voters
  bft_vote_count          INTEGER,
  bft_threshold_met       BOOLEAN,            -- 4 of 5 required
  bft_dissenting_agents   JSONB,

  -- Pythagorean Comma
  comma_severity          TEXT,               -- HARMONIC | TEMPERED | DISSONANT | PRE_BIFURC | WOLF
  comma_gap_units         NUMERIC(8,4),       -- Delta / 0.02346 (one comma = 2.346%)
  comma_auto_triggered    BOOLEAN DEFAULT FALSE,
  comma_reason            TEXT,
  rqa_escalation_applied  BOOLEAN DEFAULT FALSE, -- Was severity escalated by RQA entropy?

  -- MEL Ensemble
  mel_ensemble_direction  TEXT,
  mel_ensemble_confidence NUMERIC(5,4),
  mel_density_matrix      JSONB,              -- 2x2 coherence matrix

  -- SHOFET Final Ruling
  shofet_ruling           TEXT,               -- APPROVE | REJECT | DEFER | NO_SIGNAL
  shofet_confidence       NUMERIC(5,4),
  shofet_reasoning        TEXT,

  -- Cascade Detection
  cascade_direction       TEXT,               -- FORWARD | REVERSE | HYBRID
  reverse_cascade_detected BOOLEAN DEFAULT FALSE,
  mfdfa_echo_confirmed    BOOLEAN DEFAULT FALSE,

  -- Human Intuition
  hitl_required           BOOLEAN DEFAULT FALSE,
  hitl_completed_at       TIMESTAMPTZ,
  hitl_decision           TEXT,

  -- Output
  final_signal            TEXT,               -- BULLISH | BEARISH | NEUTRAL | NO_SIGNAL
  final_confidence        NUMERIC(5,4),
  target_price_1h         NUMERIC(20,8),
  target_price_4h         NUMERIC(20,8),
  target_price_24h        NUMERIC(20,8),
  position_size_multiplier NUMERIC(5,4) DEFAULT 1.0,
  portfolio_assignment    TEXT                -- ALPHA | BETA | GAMMA | NONE
);

-- B4: Prediction Outcomes
-- Populated after outcome is known — ground truth for APM
CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  asset                   TEXT NOT NULL,
  outcome_recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Directional accuracy
  predicted_direction     TEXT,
  actual_direction_1h     TEXT,
  actual_direction_4h     TEXT,
  actual_direction_24h    TEXT,
  directional_correct_1h  BOOLEAN,
  directional_correct_4h  BOOLEAN,
  directional_correct_24h BOOLEAN,

  -- Price accuracy
  predicted_price_1h      NUMERIC(20,8),
  predicted_price_4h      NUMERIC(20,8),
  predicted_price_24h     NUMERIC(20,8),
  actual_price_1h         NUMERIC(20,8),
  actual_price_4h         NUMERIC(20,8),
  actual_price_24h        NUMERIC(20,8),
  price_range_hit_1h      BOOLEAN,
  price_range_hit_4h      BOOLEAN,
  price_range_hit_24h     BOOLEAN,

  -- Comma validation
  comma_severity_at_signal TEXT,
  comma_veto_justified    BOOLEAN,            -- Was the WOLF veto correct?

  -- Cascade validation
  cascade_direction_correct BOOLEAN,
  reverse_cascade_confirmed BOOLEAN,

  -- Composite score
  -- score = 0.6 x directional_accuracy + 0.4 x sharpe_ratio
  directional_accuracy    NUMERIC(5,4),
  sharpe_contribution     NUMERIC(8,4),
  composite_score         NUMERIC(5,4),

  -- Slippage
  predicted_slippage_pct  NUMERIC(8,4),
  actual_slippage_pct     NUMERIC(8,4),
  w3c_upgrade_triggered   BOOLEAN DEFAULT FALSE
);

-- B5: Agent Accuracy Matrix
-- Rolling accuracy per agent per regime — drives ANFIS reweighting
CREATE TABLE IF NOT EXISTS agent_accuracy_matrix (
  id                      BIGSERIAL PRIMARY KEY,
  agent_id                TEXT NOT NULL,
  asset                   TEXT,               -- NULL = all assets
  regime_type             TEXT,               -- NULL = all regimes
  modality                TEXT,               -- on_chain | sentiment | etc
  observations            INTEGER DEFAULT 0,
  correct_predictions     INTEGER DEFAULT 0,
  accuracy_rate           NUMERIC(5,4) DEFAULT 0.50,
  avg_confidence_when_correct NUMERIC(5,4),
  avg_confidence_when_wrong   NUMERIC(5,4),
  calibration_score       NUMERIC(5,4),       -- Accuracy vs stated confidence
  anfis_weight_current    NUMERIC(5,4),
  last_weight_update      TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, asset, regime_type, modality)
);


