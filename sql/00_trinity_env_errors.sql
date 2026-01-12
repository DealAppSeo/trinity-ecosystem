CREATE TABLE IF NOT EXISTS trinity_env_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_type TEXT NOT NULL,
  missing_var TEXT,
  service TEXT,
  status TEXT CHECK (status IN ('pending', 'fixed', 'ignored')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

-- Index for faster querying by status
CREATE INDEX IF NOT EXISTS idx_env_errors_status ON trinity_env_errors(status);

-- Enable Row Level Security (RLS)
ALTER TABLE trinity_env_errors ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for now, to capture errors from failing clients)
-- In production, strict policies should be applied
CREATE POLICY "Enable insert for all users" ON trinity_env_errors FOR INSERT WITH CHECK (true);

-- Allow admins/service role to read/update
CREATE POLICY "Enable read/write for service role" ON trinity_env_errors USING (true) WITH CHECK (true);
