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
exports.registerAgent = registerAgent;
// @ts-nocheck
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
// Trusted Service Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function registerAgent(profile) {
    console.log(`🆔 Registering Agent Identity: [${profile.agent_name}]...`);
    try {
        const { error } = await supabase
            .from('trinity_agent_profiles')
            .upsert({
            agent_name: profile.agent_name,
            specialties: profile.specialties,
            collaboration_methods: profile.collaboration_methods,
            learned_knowledge: profile.learned_knowledge,
            handoff_protocols: profile.handoff_protocols,
            updated_at: new Date().toISOString()
        }, { onConflict: 'agent_name' });
        if (error) {
            console.error(`💥 Registration Failed for ${profile.agent_name}:`, error.message);
            return false;
        }
        console.log(`✅ [${profile.agent_name}] Registered/Updated in Swarm Identity.`);
        return true;
    }
    catch (err) {
        console.error(`💥 Connection Error during registration:`, err.message);
        return false;
    }
}
// CLI Support: If run directly, register specific agents based on args or default list
if (require.main === module) {
    const runRegistration = async () => {
        // Example: HDM Self-Registration
        await registerAgent({
            agent_name: 'trinity-hdm',
            specialties: ['infrastructure', 'orchestration', 'self-healing'],
            collaboration_methods: 'Gossip protocol for alerts, API handoffs for docs',
            learned_knowledge: 'Learned to reroute during failures; optimized DAG consensus',
            handoff_protocols: { docs: "Share via Supabase insert", artifacts: "GitHub PR" }
        });
        // Example: SC (Scout) Self-Registration
        await registerAgent({
            agent_name: 'trinity-scout',
            specialties: ['uptime-monitoring', 'latency-checks', 'trauma-reporting'],
            collaboration_methods: 'Logs to trinity_runtime_errors',
            learned_knowledge: 'Identified recurring offline patterns during build times.',
            handoff_protocols: { alerts: "Log to SQL" }
        });
    };
    runRegistration();
}
