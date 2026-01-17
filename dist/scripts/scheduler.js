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
// @ts-nocheck
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
// Simple Scheduler to keep agents busy
// Runs every hour or continuously checks for idle state
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
// Ecosystem Targets for Continuous Optimization
const ECOSYSTEM_DOMAINS = [
    { name: 'PurposeHub.ai', url: 'https://purposehub.ai', focus: 'impact' },
    { name: 'ImageBearer.org', url: 'https://imagebearer.org', focus: 'impact' },
    { name: 'HyperDag.org', url: 'https://hyperdag.org', focus: 'tech' },
    { name: 'AISocialMirror.com', url: 'https://aisocialmirror.com', focus: 'truth_ux' },
    { name: 'AIDebate.io', url: 'https://aidebate.io', focus: 'truth' }
];
async function runScheduler() {
    console.log("🕰️  Trinity Scheduler Online. Monitoring Fleet Activity...");
    setInterval(async () => {
        const time = new Date().toLocaleTimeString();
        // 1. Monitor Queue Depth
        const { count, error } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        if (error)
            console.error("Scheduler Error:", error.message);
        console.log(`[${time}] Pending Tasks: ${count}`);
        // ------------------------------------------------------------
        // HYBRID EVERGREEN SCHEDULER (North Star Seeder)
        // ------------------------------------------------------------
        // Only seed if queue is empty or very low to prevent spam
        if (count === 0) {
            console.log("🌑 Queue Empty. Running Opportunity Auctions (Bidder System)...");
            // 1. Get North Star (Simulated for now, could be from trinity_stats)
            const northStar = "Ensure System Homeostasis and Growth";
            // 2. Spawn Strategy Task (Bidder System)
            // Assigned to 'trinity-sophia' (Wisdom) or 'trinity-nexus' (Connector) to delegate
            await supabase.from('trinity_tasks').insert({
                title: `[STRATEGY] Align with North Star: ${northStar}`,
                description: `[EVERGREEN]\n1. ANALYZE: Current system stats.\n2. IDENTIFY: One key opportunity for optimization or growth.\n3. SPAWN: Create specific tasks for Architect or Engineer.\n4. REPORT: Log findings.`,
                task_type: 'strategy',
                assigned_to: 'trinity-sophia', // The Strategist
                priority: 90, // High priority to kickstart loop
                status: 'pending',
                metadata: { tags: ['evergreen', 'strategy', 'north-star'], benchmark: true }
            });
            console.log(`🌱 Seeded: Strategy Task for Sophia`);
        }
        else {
            console.log("🌖 Swarm Active. Checking for Auction Opportunities...");
            // HYBRID BIDDER LOGIC
            // Find tasks pending for > 10m (stuck) OR unassigned
            // In a real swarm, we'd check created_at. Here we just grab 1 unassigned to demonstrate.
            const { data: auctionableTasks } = await supabase
                .from('trinity_tasks')
                .select('*')
                .eq('status', 'pending')
                .is('assigned_to', null) // Only unassigned tasks need auction
                .limit(1);
            if (auctionableTasks && auctionableTasks.length > 0) {
                const task = auctionableTasks[0];
                console.log(`[SCHEDULER] 🔨 Triggering Auction for Task: ${task.title}`);
                try {
                    // Dynamic Import for Bidder to avoid build-time issues in scripts
                    const { runArbitrageAuction } = await Promise.resolve().then(() => __importStar(require('../lib/bidder')));
                    await runArbitrageAuction(task, 'execute');
                }
                catch (e) {
                    console.error(`[SCHEDULER] Auction Failed: ${e.message}`);
                }
            }
        }
        // Hybrid Trigger: Verify "Stuck" tasks (older than 24h) and reset them
        // ... (Logic to be added in Phase 9.1)
    }, 60000); // Check every minute
}
runScheduler().catch(console.error);
