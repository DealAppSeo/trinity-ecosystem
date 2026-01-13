-- Table for tracking runtime application errors (Client & Server)
CREATE TABLE IF NOT EXISTS trinity_runtime_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_message TEXT,
  stack_trace TEXT,
  component_stack TEXT,
  url TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT CHECK (status IN ('pending', 'analyzing', 'fixed', 'ignored')) DEFAULT 'pending',
  resolution_notes TEXT
);

-- Table for tracking Mock Client usage (to learn missing methods)
CREATE TABLE IF NOT EXISTS trinity_mock_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  method_name TEXT NOT NULL,
  args JSONB,
  call_count INTEGER DEFAULT 1,
  last_called_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying by healer agents
CREATE INDEX IF NOT EXISTS idx_runtime_errors_status ON trinity_runtime_errors(status);
CREATE INDEX IF NOT EXISTS idx_mock_calls_method ON trinity_mock_calls(method_name);

-- RLS Policies (Open for now to allow logging from client)
ALTER TABLE trinity_runtime_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE trinity_mock_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for all" ON trinity_runtime_errors FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for service role" ON trinity_runtime_errors USING (true);

CREATE POLICY "Enable insert for all" ON trinity_mock_calls FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for service role" ON trinity_mock_calls USING (true);


-- Table for managing Access Invites / Keys
CREATE TABLE IF NOT EXISTS trinity_access_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  status TEXT CHECK (status IN ('active', 'used', 'revoked', 'expired')) DEFAULT 'active',
  created_by TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_invites_code ON trinity_access_invites(code);
ALTER TABLE trinity_access_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for all" ON trinity_access_invites FOR SELECT USING (true);
CREATE POLICY "Enable insert for all" ON trinity_access_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all" ON trinity_access_invites FOR UPDATE USING (true);
