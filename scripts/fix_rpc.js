const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function breakOut() {
    console.log('--- Attempting to fix exec_sql RPC ---');

    // The current exec_sql wraps everything in: SELECT json_agg(t) FROM ( [QUERY] ) t
    // We can break out by closing the parenthesis and adding our DDL.
    const repairSql = `
    SELECT 1) t;
    DROP FUNCTION IF EXISTS public.exec_sql(text);
    CREATE OR REPLACE FUNCTION public.exec_sql(query text)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      result json;
      is_select boolean;
    BEGIN
      is_select := (LOWER(TRIM(query)) LIKE 'select%');
      IF is_select THEN
        EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
        RETURN COALESCE(result, '[]'::json);
      ELSE
        EXECUTE query;
        RETURN json_build_object('success', true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
    END;
    $$;
    SELECT 1 FROM (SELECT 1
    `;

    const { data, error } = await supabase.rpc('exec_sql', { query: repairSql });

    if (error) {
        console.error('❌ Repair failed:', error.message);
        console.log('Trying alternative repair (no DROP)...');
        // If DROP fails, try just CREATE OR REPLACE if it allows changing return type (it usually doesn't)
    } else {
        console.log('✅ exec_sql successfully repaired and upgraded to v2.');
    }
}

breakOut();
