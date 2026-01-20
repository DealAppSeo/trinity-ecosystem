import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// Force dynamic behavior
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status'); // optional filter

        // Build Query
        let query = supabase
            .from('trinity_tasks')
            .select('*')
            .order('priority', { ascending: false }) // High priority first
            .order('created_at', { ascending: false }); // Newest first

        if (status) {
            query = query.eq('status', status);
        } else {
            // Default: show pending and in_progress
            query = query.in('status', ['pending', 'in_progress']);
        }

        const { data, error } = await query.limit(50);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, description, priority, task_type, agent_assigned } = body;

        // Validation
        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const newTask = {
            title,
            description: description || '',
            priority: priority || 3, // Default normal priority
            status: 'pending',
            task_type: task_type || 'general',
            agent_assigned: agent_assigned || null, // Corrected column name
            created_at: new Date().toISOString(),
            created_by: 'admin' // HITL
        };

        const { data, error } = await supabase
            .from('trinity_tasks')
            .insert(newTask)
            .select() // Return the created task
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
