import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('trinity_agent_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching logs:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Map logs to a unified format for the UI
        const formattedLogs = (data || []).map((log: any) => ({
            id: log.id,
            agent: log.agent_name || log.agent || 'System',
            message: log.message || log.content || '',
            action: log.action || 'info',
            timestamp: log.created_at
        }));

        return NextResponse.json(formattedLogs);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
