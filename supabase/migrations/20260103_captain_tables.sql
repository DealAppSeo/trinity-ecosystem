-- 1. System Configuration (The "North Star")
-- Singleton table pattern: We only ever want ONE row here.
CREATE TABLE IF NOT EXISTS trinity_system_config (
    id INT PRIMARY KEY DEFAULT 1,
    north_star_directive TEXT DEFAULT 'Maintain system homeostasis and assist user.',
    burn_rate_status TEXT DEFAULT 'PEACE_TIME', -- 'WAR_TIME', 'PEACE_TIME'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row if not exists
INSERT INTO trinity_system_config (id, north_star_directive)
VALUES (1, 'Maintain system homeostasis and assist user.')
ON CONFLICT (id) DO NOTHING;

-- 2. Enable Realtime on Config (So UI updates instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE trinity_system_config;

-- 3. Signals / Events (For "Wake" or "SOS")
CREATE TABLE IF NOT EXISTS trinity_signals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    signal_type TEXT NOT NULL, -- 'SYSTEM_WAKE', 'EMERGENCY_STOP', 'DIRECTIVE_UPDATE'
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_created_at ON trinity_signals(created_at);
-- Agents should poll or listen to this table for 'SYSTEM_WAKE' if they are stuck in a loop/idle.
-- (Note: Sleeping agents can't read DB, so this primarily helps "idle" agents or when they wake up).
