-- ================================================
-- TRINITY SYMPHONY SCHEMA v3.1 — SECTION C
-- Run AFTER all previous sections complete
-- ================================================

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


