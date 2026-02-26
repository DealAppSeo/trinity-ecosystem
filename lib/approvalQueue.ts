import { supabaseAdmin } from './supabase';

export interface ApprovalTask {
    task_id?: string;
    agent_id: string;
    task_type: string;
    output_summary: string;
    full_output: any;
    rep_id_score: number;
    wsce_score: number;
    u_score: number;
    cost_saved: number;
    domain?: string;
}

export class ApprovalQueue {
    /**
     * Pushes a task result to the approval queue for mobile triage.
     */
    static async push(task: ApprovalTask) {
        const { data, error } = await supabaseAdmin
            .from('approval_queue')
            .insert({
                task_id: task.task_id,
                agent_id: task.agent_id,
                task_type: task.task_type,
                output_summary: task.output_summary,
                full_output: task.full_output,
                rep_id_score: task.rep_id_score,
                wsce_score: task.wsce_score,
                u_score: task.u_score,
                cost_saved: task.cost_saved,
                domain: task.domain || 'general',
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('[ApprovalQueue] Push failed:', error.message);
            throw error;
        }

        return data;
    }

    /**
     * Resolves a task in the queue.
     */
    static async resolve(id: string | number, status: 'approved' | 'rejected' | 'redirected', resolvedBy: string, note?: string) {
        const { data, error } = await supabaseAdmin
            .from('approval_queue')
            .update({
                status,
                resolved_by: resolvedBy,
                resolved_at: new Date().toISOString(),
                redirect_note: note
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ApprovalQueue] Resolve failed:', error.message);
            throw error;
        }

        return data;
    }
}
