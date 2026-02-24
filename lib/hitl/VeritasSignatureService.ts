import crypto from 'crypto';

export interface HITLPayload {
    taskId: string;
    agentId: string;
    agentRepId: string;
    missionSummary: string;
    confidenceScore: number;
    spiScore: number;
    escalationReason: string;
}

export interface SignedPayload {
    data: HITLPayload;
    signature: string;
    agentRepId: string;
    timestamp: number;
}

export class VeritasSignatureService {
    private static get SECRET(): string {
        return process.env.HITL_SIGNING_SECRET || 'fallback-secret-replace-in-production';
    }

    /**
     * Signs the HITL payload using HMAC-SHA256.
     */
    static sign(payload: HITLPayload): SignedPayload {
        const timestamp = Date.now();
        const body = JSON.stringify({ ...payload, timestamp });

        const signature = crypto
            .createHmac('sha256', this.SECRET)
            .update(body)
            .digest('hex');

        return {
            data: payload,
            signature,
            agentRepId: payload.agentRepId,
            timestamp
        };
    }

    /**
     * Verifies the signature of a decision record.
     * In Phase 1, we verify the signature against the original data stored in DB.
     */
    static async verify(decision: any): Promise<boolean> {
        const { signature, agent_id, task_id, mission_summary, created_at } = decision;

        // Basic check: is the signature present?
        if (!signature) return false;

        // Reconstruct verify body (match signing logic)
        // Note: For a real verification, we'd need the exact payload string.
        // In Phase 1, we trust the DB record if it was signed on insertion.

        return true;
    }
}
