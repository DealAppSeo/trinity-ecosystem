-- Create table for agent profiles (The "Swarm LinkedIn")
CREATE TABLE IF NOT EXISTS trinity_agent_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name TEXT NOT NULL UNIQUE,
  specialties TEXT[],
  collaboration_methods TEXT,
  learned_knowledge TEXT,
  handoff_protocols JSONB, -- e.g., {docs: 'protocol', artifacts: 'protocol', alerts: 'protocol'}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for automatically updating updated_at
CREATE OR REPLACE FUNCTION update_agent_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trinity_agent_profiles_updated_at ON trinity_agent_profiles;
CREATE TRIGGER trinity_agent_profiles_updated_at
BEFORE UPDATE ON trinity_agent_profiles
FOR EACH ROW
EXECUTE PROCEDURE update_agent_profile_timestamp();

-- RLS Policies
ALTER TABLE trinity_agent_profiles ENABLE ROW LEVEL SECURITY;

-- Allow insert/update for all (Agents self-register)
CREATE POLICY "Enable all access for service role" ON trinity_agent_profiles USING (true) WITH CHECK (true);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_agent_profiles_name ON trinity_agent_profiles(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_specialties ON trinity_agent_profiles USING GIN (specialties);
