"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.smartLLM = smartLLM;
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' }); // Ensure env loaded
const MCPManager_1 = require("./mcp/MCPManager");
/**
 * Universal LLM Caller for the Trinity Swarm.
 * Handles OpenAI connection, Tool Routing (MCP), and multi-turn loops.
 */
const DAILY_LIMIT = 500; // Free Tier Safe Limit
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
async function checkBudget() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('trinity_usage').select('calls').eq('date', today).eq('provider', 'openai').single();
    const used = (data === null || data === void 0 ? void 0 : data.calls) || 0;
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
    if (error)
        console.error('[CostGuard] ⚠️ Failed to track usage:', error.message);
}
// ... existing smartLLM ...
async function smartLLM(request) {
    var _a;
    const apiKey = process.env.OPENAI_API_KEY;
    const canSpend = await checkBudget();
    if (!apiKey || !canSpend) {
        console.warn(`[smartLLM] 🛡️ Cost Guard Active. Returning Mock Response.`);
        return { output: "Simulation (Cost Guard): Budget exceeded or Key missing." };
    }
    // Prepare request variables
    const { model = 'gpt-4o', systemPrompt, userPrompt, tools = true } = request;
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    // Get tools if enabled, otherwise empty array - ensuring we await if it returns a promise (it usually does or is sync, treating as value for now based on usage)
    const openAiTools = tools ? await MCPManager_1.mcpManager.getToolsForRole(request.role || 'default') : [];
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
            const choice = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0];
            const message = choice === null || choice === void 0 ? void 0 : choice.message;
            if (!message)
                return { output: "Error: No output from LLM" };
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
                        toolResult = await MCPManager_1.mcpManager.routeToolCall(fnName, args);
                    }
                    catch (err) {
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
            }
            else {
                // Final response
                return {
                    output: message.content || "No content returned",
                    toolCalls: i
                };
            }
        }
        return { output: "Error: Max recursion limit reached." };
    }
    catch (error) {
        console.error("[smartLLM] 💥 Fatal Error:", error.message);
        return { output: `System Error: ${error.message}` };
    }
}
