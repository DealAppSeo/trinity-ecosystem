-- Migration: Create trinity_service_registry 
-- Purpose: Dynamic management of AI models and infra services

CREATE TABLE IF NOT EXISTS public.trinity_service_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_key TEXT UNIQUE NOT NULL, -- e.g. 'openai-gpt-4o', 'flux-1', 'supabase-storage'
    service_type TEXT NOT NULL,      -- 'llm', 'image', 'audio', 'storage', 'compute'
    provider TEXT NOT NULL,          -- 'openai', 'openrouter', 'pinata', etc.
    model_id TEXT,                   -- The actual API ID (e.g. 'gpt-4o-2024-08-06')
    tier INTEGER DEFAULT 1,          -- 1 (Economy), 2 (Balanced), 3 (Elite)
    cost_per_m_tokens NUMERIC DEFAULT 0,
    latency_ms_avg INTEGER DEFAULT 200,
    is_active BOOLEAN DEFAULT true,
    specialties TEXT[],              -- ['code', 'logic', 'fast']
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by key
CREATE INDEX IF NOT EXISTS idx_service_registry_key ON public.trinity_service_registry(service_key);

-- Add initial seed data (Common Providers - Must Haves)
INSERT INTO public.trinity_service_registry (service_key, service_type, provider, model_id, tier, cost_per_m_tokens, specialties, metadata)
VALUES 
-- Elite Tier
('openai-gpt-4o', 'llm', 'openai', 'gpt-4o', 3, 15.00, ARRAY['logic', 'code', 'standard'], '{"link": "https://openai.com"}'),
('anthropic-claude-3-5', 'llm', 'anthropic', 'claude-3-5-sonnet-20241022', 3, 15.00, ARRAY['reasoning', 'writing'], '{"link": "https://anthropic.com"}'),
('perplexity-sonar', 'llm', 'perplexity', 'sonar', 3, 5.00, ARRAY['search', 'real-time'], '{"link": "https://perplexity.ai"}'),

-- Economy / Reasoning
('deepseek-r1', 'llm', 'openrouter', 'deepseek/deepseek-r1', 1, 0.27, ARRAY['reasoning', 'math', 'r1'], '{"link": "https://deepseek.com"}'),
('deepseek-v3', 'llm', 'siliconflow', 'deepseek-v3', 1, 0.20, ARRAY['coding', 'efficiency'], '{"link": "https://siliconflow.cn"}'),
('gemini-1.5-pro', 'llm', 'gemini', 'gemini-1.5-pro-latest', 2, 1.25, ARRAY['long-context', 'multimodal'], '{}'),

-- Creative / Image
('flux-1-dev', 'image', 'siliconflow', 'black-forest-labs/flux-1-dev', 2, 0.00, ARRAY['high-fidelity', 'creative'], '{"price_per_image": 0.01}'),
('sdxl', 'image', 'deepinfra', 'stability-ai/sdxl', 1, 0.00, ARRAY['speed', 'art'], '{"price_per_image": 0.005}'),

-- Infrastructure Services
('upstash-redis', 'storage', 'upstash', 'default', 3, 0.00, ARRAY['cache', 'state', 'blackboard'], '{"type": "key-value"}'),
('supabase-db', 'storage', 'supabase', 'postgres', 3, 0.00, ARRAY['relational', 'real-time'], '{"type": "sql"}'),
('n8n-workflow', 'compute', 'self-hosted', 'v1', 2, 0.00, ARRAY['automation', 'bridge'], '{}')

ON CONFLICT (service_key) DO NOTHING;
