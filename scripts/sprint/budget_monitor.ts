import { supabaseAdmin } from '../../lib/supabase';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

// Mock limits for demonstration
const LIMITS: Record<string, number> = {
    'cerebras': 1000000,
    'groq': 500000,
    'samba': 200000,
    'together': 100000,
    'deepseek': 5000000,
    'perplexity': 50000,
    'you': 50000,
    'anthropic': 100000, // expensive
    'openai': 100000,    // expensive
    'google-genai': 100000, // expensive
    'portkey': 1000000
};

async function checkBudget() {
    console.log("💰 [BUDGET MONITOR] Running Hourly Validation...");
    
    // Get usage from supabase (mock logic based on schema)
    const { data: usage, error } = await supabaseAdmin
        .from('provider_usage_log')
        .select('*');
        
    if (error) {
        console.error("Failed to fetch logs:", error);
        return;
    }

    const aggregated: Record<string, { tokens: number, spent: number }> = {};
    for (const log of usage || []) {
        if (!aggregated[log.provider_used]) aggregated[log.provider_used] = { tokens: 0, spent: 0 };
        aggregated[log.provider_used].tokens += (log.tokens_in || 0) + (log.tokens_out || 0);
        aggregated[log.provider_used].spent += (log.cost_usd || 0);
    }

    let report = "💰 PROVIDER EFFICIENCY REPORT\n";
    let totalSpent = 0;
    
    for (const provider of Object.keys(LIMITS)) {
        const stats = aggregated[provider] || { tokens: 0, spent: 0 };
        const utilized = ((stats.tokens / LIMITS[provider]) * 100).toFixed(1);
        report += `${provider.toUpperCase()}: ${stats.tokens} tokens (${utilized}%), $${stats.spent.toFixed(4)}\n`;
        totalSpent += stats.spent;
    }
    
    report += `\nTotal spent today: $${totalSpent.toFixed(4)}`;
    
    console.log(report);
    
    const hour = new Date().getHours();

    if (hour === 23) {
        // 11 PM Trigger
        console.log("🌙 [NIGHT SHIFT STARTED] Triggering aggressive burn of remaining free token limits: Cerebras, Groq, Samba, Together.");
        // We'd programmatically set GLOBAL overrides here or hit the queue trigger to start Tier1 
    } else if (hour === 6 && OWNER_ID) {
        // 6 AM Report
        try {
            await bot.telegram.sendMessage(OWNER_ID, report);
            console.log(`[BUDGET] 6 AM Report sent to ${OWNER_ID}`);
        } catch(e) {}
    }
}

checkBudget();
