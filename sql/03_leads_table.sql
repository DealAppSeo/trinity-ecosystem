-- UPGRADE LEADS TABLE FOR ONBOARDING POLL
-- Run this in Supabase SQL Editor

-- 1. Ensure Table Exists
CREATE TABLE IF NOT EXISTS trinity_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Polling Columns
ALTER TABLE trinity_leads 
ADD COLUMN IF NOT EXISTS preferred_ecosystem TEXT, -- PurposeHub, ImageBearer, etc.
ADD COLUMN IF NOT EXISTS linkedin_handle TEXT,
ADD COLUMN IF NOT EXISTS github_handle TEXT,
ADD COLUMN IF NOT EXISTS why_interested TEXT,
ADD COLUMN IF NOT EXISTS vote_timestamp TIMESTAMPTZ;

-- 3. Enable RLS (Public Insert, Private Update/Select)
ALTER TABLE trinity_leads ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT (Join)
CREATE POLICY "Allow Public Insert" ON trinity_leads FOR INSERT WITH CHECK (true);

-- Allow anyone to UPDATE their own record (via email match - tricky without Auth)
-- For MVP, we will use a Service Key in API, so no RLS policy needed for Anon Update.
-- The API will handle the security (finding record by email).
