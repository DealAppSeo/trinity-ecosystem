-- Create trinity_waitlist table
CREATE TABLE IF NOT EXISTS public.trinity_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    type TEXT NOT NULL CHECK (type IN ('dev', 'biz')),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    github_username TEXT,
    linkedin_handle TEXT,
    org_name TEXT,
    building_desc TEXT,
    pains TEXT[], -- Array of selected pain points
    plan_choice TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security
ALTER TABLE public.trinity_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (Waitlist is public)
CREATE POLICY "Allow anonymous inserts to waitlist" 
ON public.trinity_waitlist 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow authenticated users to view (Admins)
CREATE POLICY "Allow authenticated users to view waitlist" 
ON public.trinity_waitlist 
FOR SELECT 
TO authenticated 
USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_trinity_waitlist_email ON public.trinity_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_trinity_waitlist_type ON public.trinity_waitlist(type);
