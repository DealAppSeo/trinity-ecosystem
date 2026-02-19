
// @ts-nocheck
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Setup Supabase with Anon Key (verified working)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(supabaseUrl, supabaseKey);

const AGENTS = [
    'trinity-w3c', 'trinity-shofet',
    'trinity-torch', 'trinity-veritas', 'trinity-gcm',
    'trinity-chesed', 'trinity-mel', 'trinity-apm',
    'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
];

const SUGGESTIONS = [
    "Reduce API polling interval to save costs.",
    "Increase Context Window for deeper reasoning.",
    "Activate Strict Mode for code generation.",
    "Prioritize recent user logs for sentiment analysis.",
    "Switch to GPT-4o-mini for routine tasks.",
    "Enable debug logging for network requests.",
    "Refactor memory module for faster retrieval.",
    "Focus on accuracy over speed for current task."
];

async function simulateChaos() {
    console.log("🌪️  Starting Trinity Chaos Simulator...");
    console.log("Agents will come ONLINE and start processing tasks...");

    while (true) {
        // 1. Pick Random Agent
        const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];

        // 2. Determine Action
        const actionType = Math.random();

        if (actionType > 0.85) {
            // New ANFIS Suggestion (15% chance)
            const suggestion = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
            const confidence = parseFloat((0.7 + Math.random() * 0.29).toFixed(2)); // 0.70 - 0.99

            console.log(`💡 [ANFIS] Suggestion for ${agent}: ${suggestion} (${confidence * 100}%)`);

            await supabase.from('trinity_agent_registry').update({
                suggested_prompt: suggestion,
                suggestion_confidence: confidence,
                suggestion_accepted: false,
                directive_source: 'anfis_suggested',
                updated_at: new Date().toISOString()
            }).eq('agent_name', agent);

        } else {
            // Routine Update (85% chance)
            const repDrift = Math.floor(Math.random() * 5) - 2; // -2 to +2
            const tasks = Math.random() > 0.5 ? 1 : 0;

            try {
                const { error } = await supabase.rpc('increment_agent_stats', {
                    name_input: agent,
                    rep_change: repDrift,
                    tasks_change: tasks
                });
                if (error) throw error;
            } catch (err) {
                // Fallback if RPC doesn't exist (simpler update)
                // Fetch current
                const { data } = await supabase.from('trinity_agent_registry').select('reputation_score, tasks_completed').eq('agent_name', agent).single();
                if (data) {
                    await supabase.from('trinity_agent_registry').update({
                        reputation_score: Math.max(0, Math.min(100, (data.reputation_score || 50) + repDrift)),
                        tasks_completed: (data.tasks_completed || 0) + tasks,
                        status: 'working', // Ensure status is set
                        updated_at: new Date().toISOString()
                    }).eq('agent_name', agent);
                } else {
                    // Create if missing
                    await supabase.from('trinity_agent_registry').upsert({
                        agent_name: agent,
                        reputation_score: 75,
                        tasks_completed: 1,
                        status: 'working'
                    });
                }
            }

            console.log(`⚡ [UPDATE] ${agent} is active...`);
        }

        // Sleep 500ms - 2000ms
        const delay = Math.floor(Math.random() * 1500) + 500;
        await new Promise(r => setTimeout(r, delay));
    }
}

simulateChaos().catch(console.error);
