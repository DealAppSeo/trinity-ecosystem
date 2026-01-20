
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Ensure env loaded
import { mcpManager } from './mcp/MCPManager';

export interface LLMRequest {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    role?: string; // For tool permissions
    tools?: boolean; // Enable tools?
}

export interface LLMResult {
    output: string;
    toolCalls?: number;
}

/**
 * Universal LLM Caller for the Trinity Swarm.
 * Handles OpenAI connection, Tool Routing (MCP), and multi-turn loops.
 */
const DAILY_LIMIT = 500; // Free Tier Safe Limit
import { supabase } from './supabase';

async function checkBudget(): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('trinity_usage').select('calls').eq('date', today).eq('provider', 'openai').single();
    const used = data?.calls || 0;

    if (used >= DAILY_LIMIT) {
        console.warn(`[CostGuard] 🛑 Daily Limit Reached (${used}/${DAILY_LIMIT}). Switching to Mock.`);
        return false;
    }
    return true;
}

async function incrementUsage() {
    const today = new Date().toISOString().split('T')[0];
    // Upsert logic would be better, but for now simple increment attempt
    const { error } = await supabase.rpc('increment_usage', { p_date: today, p_provider: 'openai' });
    if (error) console.error('[CostGuard] ⚠️ Failed to track usage:', error.message);
}

// ... existing smartLLM ...
export async function smartLLM(request: LLMRequest): Promise<LLMResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const canSpend = await checkBudget();

    if (!apiKey || !canSpend) {
        console.warn(`[smartLLM] 🛡️ Cost Guard Active. Returning Mock Response.`);
        return { output: "Simulation (Cost Guard): Budget exceeded or Key missing." };
    }

    // Prepare request variables
    const { model = 'gpt-4o', systemPrompt, userPrompt, tools = true } = request;
    const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    // Get tools if enabled, otherwise empty array - ensuring we await if it returns a promise (it usually does or is sync, treating as value for now based on usage)
    const openAiTools = tools ? await mcpManager.getToolsForRole(request.role || 'default') : [];

    try {
        for (let i = 0; i < 5; i++) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    tools: openAiTools.length > 0 ? openAiTools : undefined,
                    tool_choice: openAiTools.length > 0 ? 'auto' : undefined
                })
            });
            // Track successful call
            await incrementUsage();


            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            const message = choice?.message;

            if (!message) return { output: "Error: No output from LLM" };

            // Add response to history
            messages.push(message);

            // Check for Tool Calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                console.log(`[smartLLM] 🛠️  Processing ${message.tool_calls.length} tool call(s)...`);

                for (const toolCall of message.tool_calls) {
                    const fnName = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log(`[smartLLM] 📞 Executing: ${fnName}`);

                    let toolResult = '';
                    try {
                        toolResult = await mcpManager.routeToolCall(fnName, args);
                    } catch (err: any) {
                        toolResult = `Error executing tool ${fnName}: ${err.message}`;
                        console.error(`[smartLLM] ❌ Tool Error:`, err);
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }
                // Loop continues to send results back to LLM
            } else {
                // Final response
                return {
                    output: message.content || "No content returned",
                    toolCalls: i
                };
            }
        }

        return { output: "Error: Max recursion limit reached." };

    } catch (error: any) {
        console.error("[smartLLM] 💥 Fatal Error:", error.message);
        return { output: `System Error: ${error.message}` };
    }
}
