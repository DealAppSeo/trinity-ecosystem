import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

// Fallback to hardcoded if necessary
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!url || !key) {
    console.error('❌ Missing Supabase credentials.');
    process.exit(1);
}

const supabase = createClient(url, key);

const OVERNIGHT_TASKS = [
    {
        title: "[DESIGN] Glassmorphic Agent Pulse Cards",
        description: "Generate a premium UI mockup for the new agent status cards. Theme: 'Amber Pulse' (working) and 'Blue Verification' (verifying). Use glassmorphism aesthetics. Use Composio Figma tool to fetch branding assets.",
        assigned_to: "trinity-mel",
        priority: 80,
        task_type: "design",
        metadata: { squad: "BETA", tags: ["ui", "glassmorphism"] }
    },
    {
        title: "[CODE] Component Sandbox Scaffold",
        description: "Create a reusable React/Next.js sandbox component in 'artifacts/code'. Use Composio GitHub tool to verify current repo structure. MANDATORY: Include Mermaid diagrams for architecture.",
        assigned_to: "trinity-hdm",
        priority: 90,
        task_type: "code",
        metadata: { squad: "GAMMA", tags: ["frontend", "scaffold"] }
    },
    {
        title: "[HEALER] Build Failure Audio Audit",
        description: "Scan 'trinity_deployment_errors' table for recent failures. Use reflection to identify common BFT failure points and propose a automated healing script.",
        assigned_to: "trinity-veritas",
        priority: 85,
        task_type: "research",
        metadata: { squad: "ALPHA", tags: ["devops", "healer"] }
    },
    {
        title: "[STRATEGY] X Arbitrage Keyword Sensor",
        description: "Research and define a list of 20 high-alpha keywords for X arbitrage. Analyze how n8n sensors can integrate via Composio hooks.",
        assigned_to: "trinity-gcm",
        priority: 75,
        task_type: "research",
        metadata: { squad: "ALPHA", tags: ["market", "strategy"] }
    },
    {
        title: "[BRIDGE] ERC-8004 Interaction Layer",
        description: "Draft the TypeScript implementation for pinning agent reputation via ERC-8004. Use Composio GitHub tool to locate relevant contract artifacts. MANDATORY: Include a Mermaid flow diagram.",
        assigned_to: "trinity-nexus",
        priority: 95,
        task_type: "code",
        metadata: { squad: "GAMMA", tags: ["web3", "reputation"] }
    },
    // 5. System Self-Improvement & Science Integration
    {
        title: '[SCIENCE] PyBrain Self-Audit',
        description: 'Verify the connection between the TypeScript ecosystem and the trinity-science Python division. Audit reward logic and ANFIS bidding coefficients for optimization.',
        assigned_to: 'trinity-orch',
        priority: 80, // Assuming a default priority if not specified, or infer from context
        task_type: 'research', // Assuming a default type
        metadata: { squad: "ALPHA", tags: ["science", "audit"] }
    },
    {
        title: '[STITCH] Google Stitch UI Refinement',
        description: 'Use the Google Stitch MCP server and Agent Skills to refine the glassmorphic aesthetics of the Conductor and Tasks pages. Aim for "Next-Gen" premium feel.',
        assigned_to: 'trinity-mel',
        priority: 70, // Assuming a default priority
        task_type: 'design', // Assuming a default type
        metadata: { squad: "BETA", tags: ["ui", "google"] }
    },
    {
        title: '[EVO] Agent Capability Expansion',
        description: 'Analyze ConstitutionalAgent.ts and propose enhancements for state persistence using LangGraph or Redis. Optimize the reflection loop for better artifact quality.',
        assigned_to: 'trinity-veritas',
        priority: 90, // Assuming a default priority
        task_type: 'code', // Assuming a default type
        metadata: { squad: "GAMMA", tags: ["evolution", "ai"] }
    }
];

async function seed() {
    console.log('--- [TRINITY PROGRESSIVE PROOF SEEDER] ---');
    console.log(`Targeting: ${url}`);

    const tasksWithTimestamps = OVERNIGHT_TASKS.map(t => ({
        ...t,
        status: 'pending',
        created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(tasksWithTimestamps);

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${OVERNIGHT_TASKS.length} Progress Proof tasks for overnight production.`);
    }
}

seed();
