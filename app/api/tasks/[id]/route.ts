import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { verifyAdminKey, unauthorizedResponse } from '@/lib/auth';

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        if (!verifyAdminKey(req)) {
            return unauthorizedResponse();
        }
        const id = params.id;
        const body = await req.json();

        const { data, error } = await supabase
            .from('trinity_tasks')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        if (!verifyAdminKey(req)) {
            return unauthorizedResponse();
        }
        const id = params.id;
        const { error } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'archived',
                result: '[ARCHIVE] Soft-purged by User/Admin Request.'
            })
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
