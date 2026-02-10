-- FIX: Ensure 'code' column exists in trinity_access_invites
-- Run this in the Supabase SQL Editor if you see "could not find the code column" errors.

DO $$
BEGIN
    -- 1. Check if 'invite_code' exists and rename it to 'code'
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_access_invites' AND column_name = 'invite_code') THEN
        ALTER TABLE trinity_access_invites RENAME COLUMN invite_code TO code;
    END IF;

    -- 2. If 'code' is still missing, add it
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_access_invites' AND column_name = 'code') THEN
        ALTER TABLE trinity_access_invites ADD COLUMN code TEXT UNIQUE;
        -- Set a reasonable default if any rows exist (optional)
        -- UPDATE trinity_access_invites SET code = 'RECOVERY-' || id::text WHERE code IS NULL;
        ALTER TABLE trinity_access_invites ALTER COLUMN code SET NOT NULL;
    END IF;

    -- 3. Ensure RLS is active and policies are correct
    ALTER TABLE trinity_access_invites ENABLE ROW LEVEL SECURITY;
    
    -- Re-create policies if they were deleted
    DROP POLICY IF EXISTS "Enable read for all" ON trinity_access_invites;
    CREATE POLICY "Enable read for all" ON trinity_access_invites FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Enable insert for all" ON trinity_access_invites;
    CREATE POLICY "Enable insert for all" ON trinity_access_invites FOR INSERT WITH CHECK (true);

END $$;
