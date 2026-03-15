import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env from the ecosystem root
dotenv.config({ path: path.resolve(__dirname, '../../trinity-ecosystem/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const assessments = [
  {
    title: 'system-audit-infrastructure',
    assigned_to: 'NEXUS',
    priority: 90,
    status: 'pending',
    description: 'Deep technical audit of Trinity Symphony infrastructure: ANFIS LASSO Routing, Semantic Graph RAG, and UnifiedServiceRegistry connectivity. Analyze MemoryManager.ts and ShimiTree.ts for [LASSO] sparsity efficiency.',
    task_type: 'audit'
  },
  {
    title: 'system-audit-data-science',
    assigned_to: 'VERITAS',
    priority: 90,
    status: 'pending',
    description: 'Evaluate Adversarial Model Ensemble and BFT Consensus (BFTModel.ts, SBFAOperator.ts). Verify Pythagorean Comma Veto activity and test Hallucination Elimination via log contradiction analysis.',
    task_type: 'audit'
  },
  {
    title: 'system-audit-compliance',
    assigned_to: 'SHOFET',
    priority: 90,
    status: 'pending',
    description: 'Audit compliance with Trinity Constitution and ERC-8004. Verify x402 Identity implementation, BFT 2/3 threshold, and RepID Sybil resistance. Provide a Grok-style Decentralized Wisdom assessment.',
    task_type: 'audit'
  }
];

const hackathonHelp = [
  {
    title: 'hackathon-ux-friction-audit',
    assigned_to: 'APM',
    priority: 70,
    status: 'pending',
    description: 'Audit recent user feedback and stability logs to identify UX friction points for the hackathon submission. Focus on the Conductor dashboard and Demo panels.',
    task_type: 'research'
  },
  {
    title: 'hackathon-competitive-analysis',
    assigned_to: 'SOPHIA',
    priority: 70,
    status: 'pending',
    description: 'Research similar hackathon winners in the decentralized AI space and highlight 3 key value propositions for our pitch. Emphasize BFT and ANFIS differentiators.',
    task_type: 'research'
  },
  {
    title: 'hackathon-how-it-works-diagram',
    assigned_to: 'HDM',
    priority: 70,
    status: 'pending',
    description: 'Create a comprehensive "How it Works" diagram for the BFT-ANFIS-RAG pipeline using Mermaid.js for the demo page. Ensure it is visually striking and clear.',
    task_type: 'design'
  },
  {
    title: 'hackathon-viral-thread-pythagorean',
    assigned_to: 'CHESED',
    priority: 70,
    status: 'pending',
    description: 'Draft a viral Twitter thread explaining the "Pythagorean Comma Veto" and its role in AI safety for the hackathon pitch. Focus on making complex math accessible.',
    task_type: 'marketing'
  },
  {
    title: 'hackathon-onchain-registry-audit',
    assigned_to: 'W3C',
    priority: 70,
    status: 'pending',
    description: 'Audit the on-chain agent registry for Base Sepolia and verify metadata consistency for ERC-8004 Identity compliance.',
    task_type: 'audit'
  }
];

async function injectTasks() {
  console.log('Injecting tasks into trinity_tasks...');
  
  const allTasks = [...assessments, ...hackathonHelp].map(t => ({
    ...t,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify({ source: 'Antigravity Audit', version: '8.0' })
  }));

  const { data, error } = await supabase.from('trinity_tasks').insert(allTasks);

  if (error) {
    console.error('Error inserting tasks:', error);
  } else {
    console.log(`Successfully injected ${allTasks.length} tasks.`);
  }
}

injectTasks();
