
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
export async function smartLLM(request: LLMRequest): Promise<LLMResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn(`[smartLLM] ⚠️ No API Key found. Returning simulation.`);
        return { output: "Simulation: LLM not configured. Set OPENAI_API_KEY." };
    }

    const model = request.model || 'gpt-4o';
    const role = request.role || 'GUEST';

    try {
        // 1. Get Tools (if requested)
        let openAiTools: any[] = [];
        if (request.tools) {
            const tools = await mcpManager.getToolsForRole(role);
            openAiTools = tools.map((tool: any) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.schema
                }
            }));
        }

        // 2. Prepare Messages
        const messages: any[] = [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt }
        ];

        // 3. Execution Loop (Max 5 turns)
        console.log(`[smartLLM] 🧠 Thinking... (Model: ${model}, Tools: ${openAiTools.length})`);

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
