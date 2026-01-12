import { supabase } from '@/lib/supabase';

// Helper to sanitize error objects for storage
const formatError = (error: any) => {
    return {
        message: error.message || String(error),
        stack: error.stack || null,
        componentStack: error.componentStack || null // React Error Boundary stack
    };
};

export const logRuntimeError = async (error: any, context: { component?: string, url?: string, userAgent?: string } = {}) => {
    console.error('🚨 [Trinity Runtime Error]:', error);

    // If we are in Mock Mode with no keys, we can't write to DB.
    // However, if we are in a partial failure state (app loaded but some feature failed), we might be able to.
    // For now, we fire and forget.
    try {
        const { message, stack, componentStack } = formatError(error);

        // Check availability of insert method (Anti-Fragile check against Mock Client)
        // If supabase.from returns the proxy that doesn't actually insert, this might fail or do nothing.
        // But our Hybrid Proxy is designed to handle this gracefully (resolves to null).

        await supabase.from('trinity_runtime_errors').insert({
            error_message: message,
            stack_trace: stack,
            component_stack: componentStack || context.component,
            url: context.url || (typeof window !== 'undefined' ? window.location.href : 'server'),
            user_agent: context.userAgent || (typeof window !== 'undefined' ? navigator.userAgent : 'server'),
            status: 'pending'
        });

    } catch (loggingError) {
        console.warn('⚠️ Failed to log error to Swarm Memory:', loggingError);
    }
};

export const logMockCall = async (method: string, args: any[]) => {
    // Only log significant mock usage to avoid noise
    if (process.env.NODE_ENV === 'production' && !method) return;

    try {
        await supabase.from('trinity_mock_calls').insert({
            method_name: method,
            args: JSON.stringify(args),
            call_count: 1 // TODO: Upsert to increment count
        });
    } catch (e) {
        // Silent fail for mock logging
    }
};
