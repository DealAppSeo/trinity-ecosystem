-- ============================================================
-- AI TRINITY SYMPHONY — CRYPTO PROGNOSTICATOR
-- MASTER SCHEMA SQL v3.1
-- Sean Patrick Goodwin (HyperDAG) | AITrinitySymphony.com
-- February 2026 | CONFIDENTIAL
-- ============================================================
-- INSTRUCTIONS:
-- 1. Run SECTION A first (extensions)
-- 2. Run SECTION B (core prediction tables) — CRITICAL path
-- 3. Run SECTION C (learning + wisdom tables)
-- 4. Run SECTION D (intelligence + monitoring tables)
-- 5. Run SECTION E (HITL + human intuition tables)
-- 6. Run SECTION F (indexes)
-- 7. Run SECTION G (partitioning) — only if AUM trigger met per v3.1 §20.1
-- ============================================================
-- CRITICAL RULES (from memory):
-- trinity_tasks.id is BIGINT not UUID
-- ALWAYS verify schema before writing queries
-- NEVER assume column names
-- ============================================================


-- ============================================================
-- SECTION A: EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy text search for wisdom RAG
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation


-- ============================================================
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


-- ============================================================
-- SECTION C: LEARNING AND WISDOM TABLES
-- ============================================================

-- C1: MCL Postmortems with RAG
CREATE TABLE IF NOT EXISTS prediction_postmortems (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  postmortem_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What worked
  winning_agents          JSONB,              -- Agents that were correct
  losing_agents           JSONB,
  decisive_features       JSONB,              -- What evidence was most predictive
  missed_signals          JSONB,              -- What the system should have caught

  -- Lessons
  lesson_summary          TEXT,
  lesson_embedding        vector(1536),       -- pgvector — retrievable by similarity
  similar_cycle_ids       JSONB,              -- Top-K similar past cycles

  -- Weight updates triggered
  anfis_updates_triggered JSONB,
  wisdom_activations      JSONB,              -- Which wisdom entries fired and were correct

  -- Cascade learning
  cascade_direction_lesson TEXT,
  reverse_cascade_lesson  TEXT,

  -- Human input
  human_postmortem_notes  TEXT,              -- Operator can add context
  human_pattern_tag       TEXT               -- Short label for MCL retrieval
);

-- C2: ANFIS Weight History — full provenance
CREATE TABLE IF NOT EXISTS anfis_weight_history (
  id                      BIGSERIAL PRIMARY KEY,
  agent_id                TEXT NOT NULL,
  regime_type             TEXT,
  asset                   TEXT,
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_before           NUMERIC(5,4),
  weight_after            NUMERIC(5,4),
  delta                   NUMERIC(5,4),
  trigger_cycle_id        UUID REFERENCES prediction_consensus(cycle_id),
  trigger_reason          TEXT,               -- Why weight changed
  exploration_method      TEXT,               -- EPSILON_GREEDY | THOMPSON | STATIC
  epsilon_at_time         NUMERIC(5,4),       -- Epsilon value when changed
  approved_by             TEXT DEFAULT 'APM'  -- APM | HUMAN_OVERRIDE
);

-- C3: Harmonic Cycles — HDM output
CREATE TABLE IF NOT EXISTS harmonic_cycles (
  id                      BIGSERIAL PRIMARY KEY,
  asset                   TEXT NOT NULL,
  detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dominant_frequency_hours NUMERIC(8,4),
  cwt_coherence_score     NUMERIC(5,4),
  emd_amplitude           NUMERIC(8,4),
  hurst_short             NUMERIC(5,4),
  hurst_long              NUMERIC(5,4),
  resonance_score         NUMERIC(8,6),
  -- resonance = coherence x amplitude x (hurst_short x 0.6 + hurst_long x 0.4)
  comma_gap_at_detection  NUMERIC(8,4),
  fractal_echo_detected   BOOLEAN DEFAULT FALSE,
  cycle_phase             TEXT,               -- ACCUMULATION | MARKUP | DISTRIBUTION | MARKDOWN
  regime_id               BIGINT REFERENCES prediction_regimes(id)
);

-- C4: Agent Capability Scores — earned secondary roles
CREATE TABLE IF NOT EXISTS agent_capability_scores (
  id                      BIGSERIAL PRIMARY KEY,
  agent_id                TEXT NOT NULL,
  modality                TEXT NOT NULL,
  capability_score        NUMERIC(5,4) DEFAULT 0.50,
  -- Starts neutral. Earns secondary at 0.58.
  -- +0.02 per correct secondary contribution
  -- -0.01 per incorrect secondary contribution
  observations            INTEGER DEFAULT 0,
  correct_secondary       INTEGER DEFAULT 0,
  secondary_eligible      BOOLEAN GENERATED ALWAYS AS (capability_score >= 0.58) STORED,
  last_contribution_at    TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, modality)
);

-- C5: Peer Lessons — cross-agent learning
CREATE TABLE IF NOT EXISTS peer_lessons (
  id                      BIGSERIAL PRIMARY KEY,
  learning_agent          TEXT NOT NULL,
  teaching_agent          TEXT NOT NULL,
  lesson_type             TEXT NOT NULL,      -- PEER_SUCCESS | PEER_FAILURE_PATTERN
  modality                TEXT NOT NULL,
  evidence_pattern        JSONB,              -- What evidence pattern triggered the lesson
  regime_context          TEXT,
  confidence_delta        NUMERIC(5,4),       -- +0.02 for success, encoded for failure
  source_orthogonal       BOOLEAN,            -- Were teaching/learning agents using different sources?
  lesson_validated        BOOLEAN,            -- Was the lesson confirmed by later cycles?
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  learned_at              TIMESTAMPTZ DEFAULT NOW(),
  expires_at              TIMESTAMPTZ         -- Peer lessons decay after 90 days
);

-- C6: Historical Wisdom Activations — tracks which wisdom entries fire and whether they help
CREATE TABLE IF NOT EXISTS historical_wisdom_activations (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  wisdom_key              TEXT NOT NULL,      -- e.g. 'dalio_paradigm_shift', 'goodwin_jockey'
  wisdom_category         TEXT,               -- MACRO | TRADER | ANALYST | GOODWIN | ANTI_PATTERN
  activating_agent        TEXT NOT NULL,
  regime_at_time          TEXT,
  lle_at_time             NUMERIC(8,6),
  signal_impact           NUMERIC(5,4),       -- How much it shifted ensemble output
  was_correct             BOOLEAN,            -- Populated at outcome time
  confidence_before       NUMERIC(5,4),
  confidence_after        NUMERIC(5,4),
  conflict_detected       BOOLEAN DEFAULT FALSE,
  conflict_resolution     TEXT,               -- REGIME_TIEBREAK | VERITAS | NO_SIGNAL
  activated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- C7: Agent Role Contributions — per-cycle role tracking
CREATE TABLE IF NOT EXISTS agent_role_contributions (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  agent_id                TEXT NOT NULL,
  contributed_modality    TEXT NOT NULL,
  role_type               TEXT NOT NULL,      -- PRIMARY | SECONDARY | HISTORICAL
  weight_applied          NUMERIC(5,4),
  capability_score_at_time NUMERIC(5,4),
  was_correct             BOOLEAN,            -- Populated at outcome time
  contributed_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- SECTION D: INTELLIGENCE AND MONITORING TABLES
-- ============================================================

-- D1: Influencer RepScores
CREATE TABLE IF NOT EXISTS influencer_rep_scores (
  id                      BIGSERIAL PRIMARY KEY,
  influencer_id           TEXT NOT NULL UNIQUE,
  display_name            TEXT NOT NULL,
  tier                    INTEGER,            -- 1 | 2 | 3
  rep_score               NUMERIC(5,4) NOT NULL,
  -- rep = 0.40 x accuracy + 0.35 x impact + 0.25 x consensus
  accuracy_score          NUMERIC(5,4),
  impact_score            NUMERIC(5,4),
  consensus_score         NUMERIC(5,4),
  total_signals           INTEGER DEFAULT 0,
  correct_signals         INTEGER DEFAULT 0,
  last_signal_at          TIMESTAMPTZ,
  last_calibration_at     TIMESTAMPTZ DEFAULT NOW(),
  committee_affiliation   TEXT,               -- For congressional members
  committee_weight        NUMERIC(5,4),       -- 0.85-0.95 per committee table
  is_congressional        BOOLEAN DEFAULT FALSE,
  is_corporate_insider    BOOLEAN DEFAULT FALSE,
  notes                   TEXT
);

-- D2: Insider Trading Signals — congressional + SEC disclosures
CREATE TABLE IF NOT EXISTS insider_trading_signals (
  id                      BIGSERIAL PRIMARY KEY,
  source_type             TEXT NOT NULL,
  -- CONGRESSIONAL_HOUSE | CONGRESSIONAL_SENATE | SEC_FORM4 | SEC_13F | CFTC_COT | LOBBYING | FEC
  actor_id                TEXT,               -- References influencer_rep_scores.influencer_id
  actor_name              TEXT NOT NULL,
  actor_committee         TEXT,
  committee_weight        NUMERIC(5,4),
  historical_accuracy     NUMERIC(5,4),
  trade_date              DATE,
  disclosure_date         DATE NOT NULL,
  lag_days                INTEGER GENERATED ALWAYS AS
                            (EXTRACT(DAY FROM disclosure_date - trade_date)::INTEGER) STORED,
  asset_traded            TEXT NOT NULL,      -- Ticker or description
  trade_direction         TEXT,               -- BUY | SELL | OPTION_CALL | OPTION_PUT | SHORT
  amount_range            TEXT,               -- e.g. '$50,001 - $100,000' (congressional format)
  amount_midpoint_usd     NUMERIC(20,2),      -- Estimated midpoint for scoring
  crypto_relevance        NUMERIC(5,4),       -- How relevant is this to crypto markets?
  congress_score          NUMERIC(5,4),
  -- CS = (committee_weight x 0.40) + (historical_accuracy x 0.35) + (crypto_relevance x 0.25)
  sell_amplified          BOOLEAN GENERATED ALWAYS AS (trade_direction = 'SELL') STORED,
  -- SELL signals automatically get 1.30x amplification
  effective_signal_strength NUMERIC(5,4),    -- congress_score x 1.30 if SELL
  w3c_source_url          TEXT,
  data_source             TEXT,               -- housestockwatcher | senatestockwatcher | capitoltrades | quiverquant | unusualwhales | sec_edgar | cftc
  detected_at             TIMESTAMPTZ DEFAULT NOW()
);

-- D3: Bubble Migration Events
CREATE TABLE IF NOT EXISTS bubble_migration_events (
  id                      BIGSERIAL PRIMARY KEY,
  detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outflow_asset_class     TEXT NOT NULL,
  -- cash_stablecoins | government_bonds | gold_commodities | blue_chip_equities
  -- growth_equities | bitcoin | ethereum_defi | large_cap_crypto | mid_cap_crypto
  -- small_cap_crypto | meme_narrative_crypto
  receiving_asset_classes JSONB,             -- Array of receiving classes with flow amounts
  total_outflow_usd       NUMERIC(20,2),
  tracked_inflow_usd      NUMERIC(20,2),
  conservation_gap_pct    NUMERIC(8,4) GENERATED ALWAYS AS
    (CASE WHEN total_outflow_usd > 0
     THEN ((total_outflow_usd - tracked_inflow_usd) / total_outflow_usd * 100)
     ELSE 0 END) STORED,
  hidden_flow_suspected   BOOLEAN GENERATED ALWAYS AS
    (CASE WHEN total_outflow_usd > 0
     THEN ((total_outflow_usd - tracked_inflow_usd) / total_outflow_usd) > 0.20
     ELSE FALSE END) STORED,
  -- Conservation gap > 20% = hidden flow alert
  predicted_next_receiver TEXT,
  migration_confidence    NUMERIC(5,4),
  risk_appetite_direction TEXT,               -- INCREASING | DECREASING | NEUTRAL
  lle_at_detection        NUMERIC(8,6),
  regime_id               BIGINT REFERENCES prediction_regimes(id)
);

-- D4: Beneficiary Analysis
CREATE TABLE IF NOT EXISTS beneficiary_analysis (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  asset                   TEXT NOT NULL,
  analyzed_at             TIMESTAMPTZ DEFAULT NOW(),
  primary_beneficiaries   JSONB,              -- Who gains most from current price
  most_exposed_parties    JSONB,              -- Who loses most from a drop
  smart_money_direction   TEXT,               -- ACCUMULATING | DISTRIBUTING | NEUTRAL
  whale_score_summary     NUMERIC(5,4),
  optics_reality_gap      NUMERIC(8,4),
  -- Positive = narrative > on-chain (bubble risk)
  -- Negative = on-chain > narrative (oversold signal)
  narrative_score         NUMERIC(5,4),       -- From TORCH
  onchain_score           NUMERIC(5,4),       -- From NEXUS
  congressional_signals   INTEGER DEFAULT 0,  -- Count of relevant congressional signals
  congressional_direction TEXT,               -- NET_BULLISH | NET_BEARISH | MIXED
  insider_signal_count    INTEGER DEFAULT 0,
  follow_the_money_flag   TEXT                -- ACCUMULATION | DISTRIBUTION | AMBIGUOUS
);

-- D5: Execution Log
CREATE TABLE IF NOT EXISTS execution_log (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  asset                   TEXT NOT NULL,
  executed_at             TIMESTAMPTZ DEFAULT NOW(),
  execution_mode          TEXT NOT NULL,      -- SIMULATION | LIVE_HITL | LIVE_AUTO
  broker                  TEXT DEFAULT 'alpaca',
  order_type              TEXT,               -- MARKET | LIMIT
  direction               TEXT,               -- BUY | SELL | HOLD
  requested_size          NUMERIC(20,8),
  executed_size           NUMERIC(20,8),
  requested_price         NUMERIC(20,8),
  executed_price          NUMERIC(20,8),
  slippage_pct            NUMERIC(8,4),
  w3c_mode_active         BOOLEAN DEFAULT FALSE,
  w3c_upgrade_triggered   BOOLEAN DEFAULT FALSE,
  slippage_threshold_used NUMERIC(5,4) DEFAULT 0.35,
  hitl_latency_ms         INTEGER,            -- Time from signal to human decision
  hitl_operator_id        TEXT,
  position_size_multiplier NUMERIC(5,4),
  chesed_tier             TEXT,               -- HARMONIC | TEMPERED | DISSONANT | PRE_BIFURC | WOLF
  comma_severity          TEXT,
  pnl_realized            NUMERIC(20,8),
  pnl_unrealized          NUMERIC(20,8),
  notes                   TEXT
);


-- ============================================================
-- SECTION E: HITL AND HUMAN INTUITION TABLES
-- ============================================================

-- E1: HITL Hunch Log — human intuition capture at every decision point
CREATE TABLE IF NOT EXISTS hitl_hunch_log (
  id                      BIGSERIAL PRIMARY KEY,
  cycle_id                UUID REFERENCES prediction_consensus(cycle_id),
  operator_id             TEXT NOT NULL DEFAULT 'sean_goodwin',
  decided_at              TIMESTAMPTZ DEFAULT NOW(),

  -- Hunch capture (required at every HITL point)
  hunch_category          TEXT NOT NULL,
  -- STRONG_YES | LEAN_YES | NEUTRAL | LEAN_NO | STRONG_NO
  -- PATTERN_SEEN | NEWS_AWARE | TIMING_FEEL
  hunch_note              TEXT,               -- Free text — what are you seeing?
  external_context        TEXT,               -- Anything you know system doesn't yet
  confidence_in_self      INTEGER CHECK (confidence_in_self BETWEEN 1 AND 10),

  -- Decision
  system_signal           TEXT,               -- What system recommended
  system_confidence       NUMERIC(5,4),
  human_decision          TEXT,               -- What human decided
  override_system         BOOLEAN DEFAULT FALSE,
  override_reason         TEXT,               -- Required if override_system = TRUE

  -- Asset and regime context
  asset                   TEXT,
  regime_at_time          TEXT,
  comma_severity_at_time  TEXT,

  -- Populated at outcome time
  hunch_was_correct       BOOLEAN,
  system_was_correct      BOOLEAN,
  hunch_added_value       BOOLEAN,            -- Did hunch improve on system?
  hias_delta              NUMERIC(5,4),       -- HIAS score change from this hunch
  outcome_recorded_at     TIMESTAMPTZ,
  outcome_notes           TEXT
);

-- E2: Human Intuition Accuracy Scores (HIAS)
-- Tracks operator accuracy per category, regime, and asset
-- The human becomes a voting agent when HIAS > 0.85
CREATE TABLE IF NOT EXISTS human_intuition_scores (
  id                      BIGSERIAL PRIMARY KEY,
  operator_id             TEXT NOT NULL,
  hunch_category          TEXT NOT NULL,
  regime_type             TEXT,               -- NULL = all regimes
  asset                   TEXT,               -- NULL = all assets
  total_hunches           INTEGER DEFAULT 0,
  correct_hunches         INTEGER DEFAULT 0,
  hias_score              NUMERIC(5,4) DEFAULT 0.50,
  -- HIAS thresholds:
  -- < 0.58 = logging only
  -- 0.58-0.70 = tracked per category
  -- 0.70-0.80 = STRONG_NO reduces auto-confidence 10%
  -- 0.80-0.85 = STRONG_NO triggers Comma review
  -- > 0.85 = STRONG_NO has DISSONANT veto power — operator IS a voting agent
  system_weight_modifier  NUMERIC(5,4) DEFAULT 0.0,
  veto_power_active       BOOLEAN GENERATED ALWAYS AS (hias_score >= 0.85) STORED,
  comma_trigger_active    BOOLEAN GENERATED ALWAYS AS (hias_score >= 0.80) STORED,
  confidence_reduction_active BOOLEAN GENERATED ALWAYS AS (hias_score >= 0.70) STORED,
  best_regime             TEXT,               -- Regime where operator is most accurate
  best_asset              TEXT,               -- Asset where operator is most accurate
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(operator_id, hunch_category, regime_type, asset)
);


-- ============================================================
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
  ON execution_log(execution_mode, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_slippage
  ON execution_log(slippage_pct DESC)
  WHERE slippage_pct > 0.30;


-- ============================================================
-- SECTION G: PARTITIONING
-- Run ONLY when AUM-percentage trigger is met (v3.1 §20.1)
-- At under $50k AUM: skip this section entirely
-- At $50k-$500k: run when query latency costs >0.1% position per cycle
-- At $500k+: run proactively before launch
-- ============================================================

-- G1: prediction_signals monthly partitioning
-- Uncomment and run when partitioning trigger is met:

/*
ALTER TABLE prediction_signals RENAME TO prediction_signals_old;

CREATE TABLE prediction_signals (
  LIKE prediction_signals_old INCLUDING ALL
) PARTITION BY RANGE (detected_at);

-- Create monthly partitions — extend forward as needed
CREATE TABLE prediction_signals_2026_02
  PARTITION OF prediction_signals
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE prediction_signals_2026_03
  PARTITION OF prediction_signals
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE prediction_signals_2026_04
  PARTITION OF prediction_signals
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Migrate existing data
INSERT INTO prediction_signals SELECT * FROM prediction_signals_old;
DROP TABLE prediction_signals_old;
*/

-- G2: historical_wisdom_activations monthly partitioning
-- Run same trigger conditions as G1

/*
ALTER TABLE historical_wisdom_activations RENAME TO historical_wisdom_activations_old;

CREATE TABLE historical_wisdom_activations (
  LIKE historical_wisdom_activations_old INCLUDING ALL
) PARTITION BY RANGE (activated_at);

CREATE TABLE historical_wisdom_activations_2026_02
  PARTITION OF historical_wisdom_activations
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE historical_wisdom_activations_2026_03
  PARTITION OF historical_wisdom_activations
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

INSERT INTO historical_wisdom_activations SELECT * FROM historical_wisdom_activations_old;
DROP TABLE historical_wisdom_activations_old;
*/


-- ============================================================
-- SECTION H: SEED DATA — Starting influencer RepScores
-- ============================================================

INSERT INTO influencer_rep_scores (influencer_id, display_name, tier, rep_score, accuracy_score, impact_score, consensus_score, is_congressional, notes)
VALUES
  -- Tier 1
  ('blackrock_fidelity', 'BlackRock / Fidelity Institutional', 1, 0.92, 0.90, 0.95, 0.88, FALSE, 'Institutional ETF flows — highest verifiability'),
  ('michael_saylor', 'Michael Saylor', 1, 0.88, 0.82, 0.95, 0.85, FALSE, 'MicroStrategy BTC accumulation — verified on-chain'),
  ('vitalik_buterin', 'Vitalik Buterin', 1, 0.87, 0.85, 0.88, 0.88, FALSE, 'Ethereum protocol signals — direct source'),
  ('cathie_wood', 'Cathie Wood / ARK Invest', 1, 0.84, 0.78, 0.88, 0.85, FALSE, '13F filings verifiable — high impact'),
  ('brian_armstrong', 'Brian Armstrong', 1, 0.83, 0.80, 0.85, 0.85, FALSE, 'Coinbase CEO — regulatory and market signals'),
  ('chris_dixon', 'Chris Dixon / a16z', 1, 0.81, 0.78, 0.83, 0.82, FALSE, 'VC deployment signals — 13F trackable'),
  -- Tier 2
  ('cz_zhao', 'CZ Zhao', 2, 0.76, 0.72, 0.82, 0.74, FALSE, 'Exchange health signals — retail psychology'),
  ('arthur_hayes', 'Arthur Hayes', 2, 0.75, 0.73, 0.78, 0.74, FALSE, 'Macro-crypto thesis — consistent edge'),
  ('pomp', 'Anthony Pompliano', 2, 0.72, 0.68, 0.76, 0.72, FALSE, 'Retail sentiment amplifier'),
  ('balaji', 'Balaji Srinivasan', 2, 0.74, 0.72, 0.74, 0.76, FALSE, 'Network state / macro signals'),
  ('benjamin_cowen', 'Benjamin Cowen', 2, 0.73, 0.75, 0.70, 0.75, FALSE, 'Technical cycle analysis — consistent'),
  ('plan_b', 'PlanB', 2, 0.70, 0.68, 0.72, 0.70, FALSE, 'S2F model — regime-specific accuracy'),
  ('willy_woo', 'Willy Woo', 2, 0.72, 0.74, 0.70, 0.72, FALSE, 'On-chain analytics — NEXUS complement'),
  -- Tier 3
  ('altcoin_daily', 'Altcoin Daily', 3, 0.58, 0.52, 0.64, 0.58, FALSE, 'Retail sentiment signal — contrarian use'),
  ('elon_musk', 'Elon Musk', 3, 0.44, 0.38, 0.65, 0.30, FALSE, 'High impact, terrible accuracy — contrarian amplifier'),
  -- Congressional seed data (init weights — APM calibrates from cycle 1)
  ('pelosi_nancy', 'Nancy Pelosi', 1, 0.89, 0.88, 0.85, 0.85, TRUE, 'House Minority Leader — consistent outperformance. Financial Services adjacent.'),
  ('johnson_mike', 'Mike Johnson', 2, 0.85, 0.80, 0.88, 0.85, TRUE, 'Speaker of the House — broad regulatory visibility')
ON CONFLICT (influencer_id) DO NOTHING;

-- ============================================================
-- SECTION I: VERIFICATION QUERIES
-- Run after schema deploy to confirm everything is correct
-- NEVER skip verification
-- ============================================================

-- Verify all 16 tables exist
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = t.table_name 
        AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Verify generated columns work
SELECT 
  conservation_gap_pct,
  hidden_flow_suspected
FROM bubble_migration_events LIMIT 1;

-- Verify HIAS computed columns
SELECT 
  veto_power_active,
  comma_trigger_active,
  confidence_reduction_active
FROM human_intuition_scores LIMIT 1;

-- Verify RepScore seed data
SELECT influencer_id, display_name, tier, rep_score, is_congressional
FROM influencer_rep_scores
ORDER BY tier, rep_score DESC;

-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================
-- END OF SCHEMA v3.1
-- Tables: 16 total
-- Indexes: 24 total
-- Generated columns: conservation_gap_pct, hidden_flow_suspected,
--                    sell_amplified, lag_days, secondary_eligible,
--                    veto_power_active, comma_trigger_active,
--                    confidence_reduction_active
-- Partitioning: Section G — deploy per AUM trigger in v3.1 §20.1
-- ============================================================
