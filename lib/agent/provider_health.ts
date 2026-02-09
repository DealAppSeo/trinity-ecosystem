import { supabase } from '../supabase';

export interface ProviderHealth {
    provider: string;
    is_healthy: boolean;
    error_count: number;
    latency_ms: number;
    last_checked: string;
}

export async function recordProviderHealth(provider: string, isHealthy: boolean, latency: number = 0) {
    try {
        console.log(`[Health] Recording ${provider} health: ${isHealthy ? '✅' : '❌'} (${latency}ms)`);

        // We log to trinity_agent_logs for visibility
        await supabase.from('trinity_agent_logs').insert({
            agent_name: 'trinity-apm', // Automated Performance Monitor
            action: isHealthy ? 'HEALTH_UP' : 'HEALTH_DOWN',
            details: `Provider: ${provider}, Latency: ${latency}ms, Status: ${isHealthy ? 'Healthy' : 'Error'}`,
            created_at: new Date().toISOString()
        });

        // Optionally update a dedicated health table if it existed, 
        // but for now, we use the logs to trigger alerts or for intelligence routing.

    } catch (e) {
        console.error('[Health] Failed to record provider health:', e);
    }
}

export async function checkProviderAvailability(provider: string): Promise<boolean> {
    // Basic logic: Check if there was a recent major failure in the last 5 minutes
    try {
        const { data, error } = await supabase
            .from('trinity_agent_logs')
            .select('*')
            .eq('agent_name', 'trinity-apm')
            .eq('action', 'HEALTH_DOWN')
            .ilike('details', `%${provider}%`)
            .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
            .limit(1);

        if (error) return true; // Fail open
        return data.length === 0;
    } catch (e) {
        return true;
    }
}
