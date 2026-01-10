-- REFERRAL SYSTEM & REWARDS
-- Run this in Supabase SQL Editor

-- 1. Add Referral Columns to trinity_leads
ALTER TABLE trinity_leads 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE, -- The user's unique invite code
ADD COLUMN IF NOT EXISTS referred_by TEXT,          -- The code of the user who invited them
ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0,  -- "Cred" / Reward Points
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb; -- Flexible storage for QR urls, tier data etc.

-- 2. Create Index for faster referral lookups
CREATE INDEX IF NOT EXISTS idx_leads_referral_code ON trinity_leads(referral_code);
CREATE INDEX IF NOT EXISTS idx_leads_referred_by ON trinity_leads(referred_by);

-- 3. (Optional) Create function to auto-generate referral code on insert
-- For now, we can handle this in the API to keep SQL simple, or use a trigger.
-- Let's stick to API generation for flexibility.
