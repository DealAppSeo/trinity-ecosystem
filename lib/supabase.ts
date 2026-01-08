import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    // During build time on some platforms, these might be missing. 
    console.warn('⚠️ Missing Supabase environment variables! Using placeholders for build.');
}

// Fallback to placeholders to prevent 'supabaseUrl is required' error during build
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseKey || 'placeholder';

export const supabase = createClient(url, key);
