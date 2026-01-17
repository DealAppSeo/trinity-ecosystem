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
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const NEUROSWARM_TASKS = [
    // 🌱 Seed Phase: Ideation
    {
        title: "[Genesis] Ideation: NeuroSwarm Concepts",
        description: "Brainstorm 10 product ideas at the intersection of AI, Web3, and ANFIS/GNNs. Focus on 'Adaptive Swarms'. Output a markdown list.",
        task_type: "reasoning",
        assigned_to: "trinity-cdo",
        priority: 100
    },
    {
        title: "[Genesis] Pitch Drafting",
        description: "Select the top 3 concepts from Ideation. Write a 2-sentence 'Elevator Pitch' for each, creating a clear value prop for a decentralized audience.",
        task_type: "content",
        assigned_to: "trinity-cdo",
        priority: 95
    },
    {
        title: "[Genesis] Innovation: Hybrid Models",
        description: "Research and describe 3 specific use cases for integrating ANFIS (Fuzzy Logic) with GNNs (Graph Neural Networks) in a Web3 context (e.g., Dynamic gas pricing, DAO voting).",
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 95
    },
    // 🌿 Sprout Phase: Validation
    {
        title: "[Genesis] Market Recon",
        description: "Search for the latest market size data for 'Decentralized AI' and 'Web3 Agents'. Cite sources (Gartner, Messari, etc.). Create a 'Market Opportunity' artifact.",
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 90
    },
    {
        title: "[Genesis] Competitor Analysis: Ocean & Bittensor",
        description: "Analyze Ocean Protocol and Bittensor. Create a comparison table vs. our proposed 'NeuroSwarm'. Highlight our unfair advantage (Adaptive ANFIS).",
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 90
    },
    // 🪴 Seedling Phase: Planning
    {
        title: "[Genesis] Architecture: Agent Swarm Topology",
        description: "Design a high-level GNN topology for the agent swarm network. How do nodes communicate? Describe the graph structure.",
        task_type: "code",
        assigned_to: "trinity-veritas", // Logic/Truth
        priority: 85
    }
];
async function seed() {
    console.log("🚀 Igniting NeuroSwarm Genesis Engine...");
    for (const task of NEUROSWARM_TASKS) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            status: 'pending',
            created_at: new Date().toISOString(),
            requires_external_artifact: true,
            metadata: { tags: ['genesis', 'neuroswarm', 'startup'] }
        });
        if (error)
            console.error(`Failed to insert ${task.title}:`, error.message);
        else
            console.log(`✅ Queued: ${task.title}`);
    }
    console.log("Genesis Sequence Initiated.");
}
seed().catch(console.error);
