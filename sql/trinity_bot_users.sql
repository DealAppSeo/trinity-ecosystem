-- TRINITY BOT ROLE-BASED ACCESS CONTROL (RBAC)
-- Table to manage Telegram users and their permissions

CREATE TABLE IF NOT EXISTS public.trinity_bot_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'observer' CHECK (role IN ('owner', 'admin', 'observer')),
    preferences JSONB DEFAULT '{"priority": "balanced", "budget_limit": null}'::jsonb,
    granted_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Owner (Initial Setup)
-- Assuming the chat ID provided in environment variables as the owner
INSERT INTO public.trinity_bot_users (chat_id, role, granted_by)
SELECT current_setting('custom.telegram_owner_id', true), 'owner', 'system'
ON CONFLICT (chat_id) DO NOTHING;

-- Index for fast lookup by chat_id
CREATE INDEX IF NOT EXISTS idx_trinity_bot_users_chat_id ON public.trinity_bot_users(chat_id);

-- RLS Policies
ALTER TABLE public.trinity_bot_users ENABLE ROW LEVEL SECURITY;

-- Service Role or Admin role should have full access
CREATE POLICY "Enable full access for service role" ON public.trinity_bot_users FOR ALL USING (true) WITH CHECK (true);

-- Users can read their own role (though bot uses service role)
CREATE POLICY "Users can read own role" ON public.trinity_bot_users FOR SELECT USING (true);

COMMENT ON TABLE public.trinity_bot_users IS 'Manages RBAC for @AITrinityBot Telegram interface';
