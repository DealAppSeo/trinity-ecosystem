-- Add access_level to trinity_artifacts if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'access_level') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN access_level TEXT DEFAULT 'protected';
    END IF;
END $$;

-- Create trinity_access_requests table
CREATE TABLE IF NOT EXISTS trinity_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    phone TEXT,
    social_handle TEXT,
    requested_resource TEXT DEFAULT 'ALL',
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_requests_email ON trinity_access_requests(email);
