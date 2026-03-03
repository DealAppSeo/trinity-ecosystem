-- ================================================
-- TRINITY SYMPHONY SCHEMA v3.1 — SECTION D
-- Run AFTER all previous sections complete
-- ================================================

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
                            ((disclosure_date - trade_date)) STORED,
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
CREATE TABLE IF NOT EXISTS trade_execution_log (
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


