
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase with Service Key (Admin Access)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.tXfcjDUB2D-WzEQ5q97fWJ9-6npzJ9-7e7e7e7e7e7';
console.log('🔑 API Route using Service Key length:', SERVICE_KEY?.length);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SERVICE_KEY
);

export async function POST(request: Request) {
    try {
        const { agent_name, action, suggestion } = await request.json();

        console.log(`⚖️ Governance Action: [${action}] for ${agent_name}`);

        if (action === 'accept') {
            const { error } = await supabase.from('trinity_agent_registry').update({
                system_prompt: suggestion,
                directive_source: 'human',
                suggested_prompt: null,
                suggestion_accepted: true,
                suggestion_timestamp: new Date().toISOString()
            }).eq('agent_name', agent_name);

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Suggestion Accepted' });

        } else if (action === 'reject') {
            const { error } = await supabase.from('trinity_agent_registry').update({
                suggested_prompt: null,
                suggestion_accepted: false
            }).eq('agent_name', agent_name);

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Suggestion Rejected' });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Governance Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
