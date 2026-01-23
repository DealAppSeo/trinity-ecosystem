import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { supabaseAdmin as supabase } from '../lib/supabase';
import { AGENT_WISDOM } from '../lib/agent/wisdom';

async function seedProductionMission() {
    console.log('--- MISSION 2026: TOTAL RESET & PRODUCTION SEED ---');

    // 1. DELETE ALL TASKS (Fresh Start)
    console.log('Clearing old tasks...');
    const { error: delErr } = await supabase.rpc('exec_sql', {
        query: 'TRUNCATE TABLE trinity_tasks RESTART IDENTITY CASCADE'
    });

    if (delErr) {
        console.warn('Truncate failed, attempting filtered delete...', delErr.message);
        await supabase.from('trinity_tasks').delete().neq('id', -1).limit(500);
    } else {
        console.log('Table truncated successfully.');
    }

    // 2. DEFINE MISSIONS (12 High-Value Tasks)
    const missions = [
        // ALPHA SQUAD (TRUTH/ORCH)
        {
            title: '[STRATEGY] AI + Web3 Viral Loop Roadmap 2026',
            description: 'Design a viral growth loop integrating AI-generated social proof and Web3 token incentives.',
            task_type: 'report',
            priority: 90,
            assigned_to: 'trinity-veritas'
        },
        {
            title: '[LOGIC] BFT Consensus Logic Review',
            description: 'Review the current Triad Consensus implementation for potential BFT edge cases and security gaps.',
            task_type: 'code',
            priority: 85,
            assigned_to: 'trinity-orch'
        },
        {
            title: '[PATTERN] Market Narrative Extraction',
            description: 'Scan top DeFi and AI news for the last 24h and extract the core narrative patterns.',
            task_type: 'research',
            priority: 80,
            assigned_to: 'trinity-torch'
        },
        {
            title: '[ETHICS] Autonomous Agency Guardrails',
            description: 'Define the boundary conditions for autonomous agent spending and external API interaction.',
            task_type: 'report',
            priority: 95,
            assigned_to: 'trinity-gcm'
        },
        {
            title: '[GOVERNANCE] Dispute Resolution Protocol v2',
            description: 'Develop a framework for Shofet to handle agent-peer disputes over artifact quality.',
            task_type: 'report',
            priority: 85,
            assigned_to: 'trinity-shofet'
        },

        // BETA SQUAD (CARE/DESIGN)
        {
            title: '[DESIGN] Glassmorphism Dashboard v2',
            description: 'Create a design spec for the new Glassmorphism-inspired agent dashboard (Apple Vision Pro aesthetic).',
            task_type: 'design',
            priority: 90,
            assigned_to: 'trinity-mel'
        },
        {
            title: '[EMPATHY] Humanitarian Impact Analysis',
            description: 'Map out how the Trinity swarm can support decentralized humanitarian aid routing.',
            task_type: 'report',
            priority: 75,
            assigned_to: 'trinity-chesed'
        },
        {
            title: '[WISDOM] Spiritual Backbone Integration',
            description: 'Formulate the "Sabbath Reflection" prompts to ensure agent alignment with core virtues.',
            task_type: 'report',
            priority: 70,
            assigned_to: 'trinity-apm'
        },

        // GAMMA SQUAD (BUILD/INFRA)
        {
            title: '[INFRA] zkSTARK Proof Aggregator',
            description: 'Draft the implementation plan for aggregating agent reputation proofs using zkSTARKs.',
            task_type: 'code',
            priority: 85,
            assigned_to: 'trinity-hdm'
        },
        {
            title: '[CODE] Web3 Wallet Interop Layer',
            description: 'Implement a cross-chain wallet interface for agents to manage mission bounties.',
            task_type: 'code',
            priority: 90,
            assigned_to: 'trinity-w3c'
        },
        {
            title: '[INTEGRATION] Nexus Flow Synchronization',
            description: 'Optimize the data flow between the Python Brain (Science) and the TypeScript Agent Core.',
            task_type: 'code',
            priority: 80,
            assigned_to: 'trinity-nexus'
        },
        {
            title: '[RESEARCH] Deep-Thought Wisdom Synthesis',
            description: 'Synthesize the findings from current agent retrospectives into a unified growth manual.',
            task_type: 'research',
            priority: 75,
            assigned_to: 'trinity-sophia'
        }
    ];

    console.log(`Seeding ${missions.length} missions...`);
    for (const mission of missions) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...mission,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        if (error) console.error(`Failed to seed ${mission.title}:`, error.message);
    }

    console.log('--- MISSION 2026 SEEDED ---');
}

seedProductionMission();
