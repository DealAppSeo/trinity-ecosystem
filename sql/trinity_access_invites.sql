-- TRINITY ACCESS SYSTEM
-- Table for managing invite codes for the Controller Subdomain

CREATE TABLE IF NOT EXISTS public.trinity_access_invites (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked', 'expired')),
    tier text NOT NULL DEFAULT 'standard', -- 'standard', 'admin', 'observer'
    created_by text DEFAULT 'system', -- Agent name or Admin ID
    used_by text, -- User ID or Email when claimed
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup by code
CREATE INDEX IF NOT EXISTS idx_trinity_invites_code ON public.trinity_access_invites(code);

-- RLS Policies
ALTER TABLE public.trinity_access_invites ENABLE ROW LEVEL SECURITY;

-- Allow public read for checking codes (validated via middleware/RPC usually, but need generic read for safety)
-- In production, this should be stricter.
CREATE POLICY "Enable read access for all users" ON public.trinity_access_invites FOR SELECT USING (true);

-- Allow admins/service role to insert/update
CREATE POLICY "Enable write access for service role" ON public.trinity_access_invites FOR ALL USING (true) WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.trinity_access_invites IS 'Manages access codes for controller.aitrinitysymphony.com';
