-- Phase 3: Progressive Permissions & Registration Schema

-- 1. Create `trinity_access_requests` table for the Registration Modal
CREATE TABLE IF NOT EXISTS public.trinity_access_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    phone TEXT,
    social_handle TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    requested_resource TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add `access_level` to `trinity_artifacts` if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'access_level') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN access_level TEXT DEFAULT 'protected';
    END IF;
END $$;

-- 3. Enable RLS on new table
ALTER TABLE public.trinity_access_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES

-- Allow ANYONE (anon) to INSERT a request (Registration)
CREATE POLICY "Allow public registration" 
ON public.trinity_access_requests 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Allow ANYONE to Read Artifacts (Metadata) - Essential for "Counts"
-- (We rely on the UI 'password gate' for content protection in Phase 3 prototype, 
--  but we allow reading the rows so the counts appear).
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trinity_artifacts;
CREATE POLICY "Enable read access for all users" 
ON public.trinity_artifacts 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Ensure Service Role has full access
CREATE POLICY "Service Role Full Access Requests" ON public.trinity_access_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
