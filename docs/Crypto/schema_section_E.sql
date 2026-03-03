-- ================================================
-- TRINITY SYMPHONY SCHEMA v3.1 — SECTION E
-- Run AFTER all previous sections complete
-- ================================================

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


