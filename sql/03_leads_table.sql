-- Lead Capture Table
CREATE TABLE IF NOT EXISTS trinity_leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    interest TEXT,   -- 'coding', 'design', 'ethics', etc.
    role TEXT,       -- 'co-developer', 'tester', etc.
    linkedin TEXT,
    github TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'contacted', 'onboarded'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- RLS Policies (Start secure)
ALTER TABLE trinity_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public landing page)
CREATE POLICY "Allow anonymous inserts" ON trinity_leads FOR INSERT WITH CHECK (true);

-- Allow admins to view (authenticated)
CREATE POLICY "Allow admin select" ON trinity_leads FOR SELECT USING (auth.role() = 'authenticated');
