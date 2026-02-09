
import { supabase, supabaseAdmin } from '../supabase';
import { Task } from './types';

export enum HITLDecision {
    APPROVE = 'approved',
    REJECT = 'rejected',
    MODIFY = 'modified'
}

export interface HITLRequest {
    id?: string;
    task_id: string;
    agent_id: string;
    reason: string;
    context?: any;
    status: 'pending' | 'approved' | 'rejected' | 'modified';
    decision_metadata?: any;
}

export class HITLManager {
    private static instance: HITLManager;

    private constructor() { }

    public static getInstance(): HITLManager {
        if (!HITLManager.instance) {
            HITLManager.instance = new HITLManager();
        }
        return HITLManager.instance;
    }

    /**
     * Escalates a task to the human-in-the-loop gateway.
     */
    async escalate(taskId: string, agentId: string, reason: string, context?: any): Promise<string> {
        console.log(`[HITL] 🚨 Escalation Requested by ${agentId} for task ${taskId}: ${reason}`);

        const { data, error } = await supabaseAdmin
            .from('trinity_hitl_requests')
            .insert({
                task_id: taskId,
                agent_id: agentId,
                reason,
                context,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error(`[HITL] ❌ Failed to create escalation:`, error.message);
            throw error;
        }

        // Potential for Push Notification trigger here (e.g., via a helper or external service)
        console.log(`[HITL] ✅ Request ${data.id} published to Founder Control Plane.`);
        return data.id;
    }

    /**
     * Polls for a decision on a specific HITL request.
     */
    async checkDecision(requestId: string): Promise<HITLRequest | null> {
        const { data, error } = await supabase
            .from('trinity_hitl_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (error) return null;
        if (data.status !== 'pending') return data as HITLRequest;

        return null;
    }

    /**
     * Resolves a request (Called by the Founder UI).
     */
    async resolve(requestId: string, decision: HITLDecision, metadata?: any, resolverId: string = 'founder-one'): Promise<void> {
        const { error } = await supabaseAdmin
            .from('trinity_hitl_requests')
            .update({
                status: decision,
                decision_metadata: metadata,
                resolved_at: new Date().toISOString(),
                resolved_by: resolverId
            })
            .eq('id', requestId);

        if (error) {
            console.error(`[HITL] ❌ Failed to resolve ${requestId}:`, error.message);
            throw error;
        }

        console.log(`[HITL] 🏁 Request ${requestId} resolved: ${decision}`);
    }
}
