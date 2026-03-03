-- [TRACK 3] ZKP Reputation Identity & ERC-8004 DBT Standard
-- This migration adds the necessary fields for verifiable agent credentials.
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.trinity_agent_registry 
ADD COLUMN IF NOT EXISTS repid_proof text, -- The Plonky3 proof string
ADD COLUMN IF NOT EXISTS dbt_metadata jsonb, -- ERC-8004 Digital Bound Token metadata
ADD COLUMN IF NOT EXISTS proof_timestamp timestamp with time zone;

-- Index for proof lookups if needed
CREATE INDEX IF NOT EXISTS idx_agent_proof_timestamp ON public.trinity_agent_registry(proof_timestamp);

-- Feedback for the user
COMMENT ON COLUMN public.trinity_agent_registry.repid_proof IS 'ZKP proof confirming agent exceeds reputation thresholds (Filing 1: Section VI)';
COMMENT ON COLUMN public.trinity_agent_registry.dbt_metadata IS 'ERC-8004 compliant Digital Bound Token attributes (SBT-equivalent for AI)';
