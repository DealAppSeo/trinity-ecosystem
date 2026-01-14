CREATE TABLE IF NOT EXISTS trinity_runtime_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_message TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    stack_trace TEXT,
    status TEXT DEFAULT 'pending', -- pending, analyzing, fixed, ignored
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- RLS Policies
ALTER TABLE trinity_runtime_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to errors" ON trinity_runtime_errors
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow agents to read errors" ON trinity_runtime_errors
    FOR SELECT USING (true);

CREATE POLICY "Allow agents to update errors" ON trinity_runtime_errors
    FOR UPDATE USING (true);
