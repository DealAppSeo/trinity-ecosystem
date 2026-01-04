import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
    req: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const body = await req.json();
        const { agent } = body;
        const taskId = params.id;

        if (!agent) {
            return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('trinity_tasks')
            .update({
                claimed_by: agent,
                status: 'in_progress', // Auto-move to in_progress if assigned manually? Or keep pending?
                // Usually better to let agent pick it up, but force-assign implies "do this now".
                // Let's set to 'pending' but with claimed_by, or 'in_progress'. 
                // Agent logic usually looks for claimed_by=Me OR (claimed_by=null & status=pending).
                // If we set claimed_by, the named agent will pick it up. 
                // Let's generic update just claimed_by.
            })
            .eq('id', taskId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
