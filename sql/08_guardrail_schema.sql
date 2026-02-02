-- GuardRail AI: Security Schema
-- Version: 1.0.0

-- 1. guardrail_events: Audit log for all security interceptions
CREATE TABLE IF NOT EXISTS public.guardrail_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    event_type TEXT NOT NULL, -- 'prompt_firewall_scan', 'action_sandbox_exec', 'network_block', 'consent_gate'
    agent_source TEXT, -- 'moltbot', 'chatgpt', 'claude', 'trinity'
    input_text TEXT, -- The intercepted content (optional, privacy-sensitive)
    decision TEXT NOT NULL, -- 'allow', 'block', 'warn', 'redact'
    threat_level TEXT DEFAULT 'minimal', -- 'minimal', 'low', 'medium', 'high', 'critical'
    metadata JSONB DEFAULT '{}', -- Details about the rule triggered
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. guardrail_policies: Configuration for GuardRail strictness
CREATE TABLE IF NOT EXISTS public.guardrail_policies (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users UNIQUE,
    prompt_firewall_enabled BOOLEAN DEFAULT TRUE,
    sandbox_strictness TEXT DEFAULT 'medium', -- 'permissive', 'medium', 'strict'
    network_allowlist TEXT[] DEFAULT ARRAY['api.openai.com', 'api.anthropic.com', 'api.google.com', 'github.com'],
    consent_required_actions TEXT[] DEFAULT ARRAY['file_delete', 'send_email', 'financial_transaction'],
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. guardrail_threat_patterns: Crowd-sourced injection/threat signatures
CREATE TABLE IF NOT EXISTS public.guardrail_threat_patterns (
    id BIGSERIAL PRIMARY KEY,
    pattern_type TEXT NOT NULL, -- 'injection', 'exfiltration', 'poisoning'
    signature TEXT NOT NULL,
    threat_level TEXT DEFAULT 'medium',
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. guardrail_consent_history: User approval logs
CREATE TABLE IF NOT EXISTS public.guardrail_consent_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    action_type TEXT NOT NULL,
    action_details JSONB,
    decision TEXT NOT NULL, -- 'allow_once', 'allow_forever', 'deny'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE public.guardrail_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrail_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrail_threat_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrail_consent_history ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "Users view own guardrail_events" ON public.guardrail_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users manage own guardrail_policies" ON public.guardrail_policies FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users view own guardrail_consent" ON public.guardrail_consent_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Public read verified threat patterns" ON public.guardrail_threat_patterns FOR SELECT TO authenticated, anon USING (verified = true);

-- 7. Service Role Full Access
CREATE POLICY "Service role full access on events" ON public.guardrail_events FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on policies" ON public.guardrail_policies FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on threats" ON public.guardrail_threat_patterns FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on consent" ON public.guardrail_consent_history FOR ALL TO service_role USING (true);
