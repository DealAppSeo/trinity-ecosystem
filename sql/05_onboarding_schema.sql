-- Onboarding Tables for Early Adopters

CREATE TABLE IF NOT EXISTS trinity_onboarding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    tier TEXT,
    byok_enabled BOOLEAN DEFAULT FALSE,
    byok_key TEXT,
    promo_code TEXT,
    referral_code TEXT,
    status TEXT DEFAULT 'pending_verification',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trinity_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    source TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
