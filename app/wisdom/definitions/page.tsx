'use client';

import { Card } from '@/components/ui/Card';
import {
    BookOpen, Shield, Cpu, Zap, Network, Globe, Lock,
    Flame, Activity, Scale, Compass, Key, FastForward,
    Repeat, Music, Sparkles, Fingerprint, Coins, Database, EyeOff
} from 'lucide-react';

const GLOSSARY_CATEGORIES = [
    {
        title: 'Symphony Orchestration',
        items: [
            {
                term: 'Major7 Team Synergy',
                definition: 'A 4-agent parallel dispatch model (Root, Third, Fifth, Seventh) that creates harmonic reasoning paths for complex problem-solving, verifying results through spectral diversity.',
                icon: <Music className="text-violet-400" />
            },
            {
                term: 'Golden Ratio BFT',
                definition: 'A consensus threshold of 61.8% (1/phi) used to determine truth-state collapse in multi-agent environments, providing a mathematically robust alternative to simple majorities.',
                icon: <Scale className="text-cyan-400" />
            },
            {
                term: '3x3+3 BFT Model',
                definition: 'A three-tiered neural swarm structure: 3 Core Orchestrators (Strategists), 3 Specialty Squads (Execution), and 3 Sovereign Validators (Truth-Checkers).',
                icon: <Network className="text-blue-400" />
            },
            {
                term: 'Pyro Dynamic Escalation',
                definition: 'An automated emergency trigger that escalates tasks to Human-In-The-Loop (HITL) oversight when extreme disagreement or consensus failure is detected.',
                icon: <Flame className="text-orange-400" />
            },
            {
                term: 'Heterogeneous LLM Protocol',
                definition: 'Cross-verifying results between disparate model families (Anthropic, OpenAI, Google, OSS) to eliminate systematic bias and vendor lock-in.',
                icon: <Zap className="text-yellow-400" />
            }
        ]
    },
    {
        title: 'Sovereign Identity',
        items: [
            {
                term: 'DBT to SBT Conversion',
                definition: 'The transition from a Digital Bound Token (at onboarding) to a Soulbound Token (SBT) upon successful verification, carrying permanent, non-transferable reputation.',
                icon: <Lock className="text-emerald-400" />
            },
            {
                term: '4-Factor Authentication (4FA)',
                definition: 'Verification via Knowledge (Secret), Possession (Device), Biometric (Hash), and Context (Behavior) to establish undeniable Proof of Life (POL).',
                icon: <Shield className="text-emerald-500" />
            },
            {
                term: 'ZKP RepID',
                definition: 'Zero-Knowledge Proof Reputation Identity. Proving trustworthiness (e.g., "Accuracy > 95%") without revealing underlying private data or mission logs.',
                icon: <EyeOff className="text-violet-500" />
            },
            {
                term: 'Judas Agent Discovery',
                definition: 'The identification of the most adversarial or outlier reasoning path in a consensus team using KL divergence audits to detect subtle hallucinations.',
                icon: <Compass className="text-red-400" />
            },
            {
                term: 'Proof of Life (POL)',
                definition: 'A biometric-first verification standard that ensures every critical action in the Trinity ecosystem originates from a verified human consciousness.',
                icon: <Fingerprint className="text-cyan-500" />
            }
        ]
    },
    {
        title: 'Integrity & Calibration',
        items: [
            {
                term: 'RepID Calibration Rewards',
                definition: 'Incentives provided to agents that maintain high within-subject confidence error (WSCE) calibration, discouraging over-confident hallucinations.',
                icon: <Coins className="text-amber-400" />
            },
            {
                term: 'Veritas Belief Vectors',
                definition: 'A standardized 3-dimensional probability distribution [p_success, p_partial, p_failure] used for mathematical belief aggregation across the swarm.',
                icon: <Activity className="text-rose-400" />
            },
            {
                term: 'S(pi) Functional Terms',
                definition: 'A multi-variable performance metric aggregating loss, disagreement, cost, and latency into a single quality-of-decision score.',
                icon: <FastForward className="text-blue-500" />
            },
            {
                term: 'ITCM Consensus Margin',
                definition: 'Inter-Temporal Consensus Margin. A metric measuring the stability of truth-states over time to detect gradual reasoning decay or "bit-flips".',
                icon: <Repeat className="text-indigo-400" />
            },
            {
                term: 'SLM Cluster Optimization',
                definition: 'Utilizing clusters of Small Language Models (e.g., Phi, Gemma) for pre-filtering and low-risk analysis, reducing compute costs by up to 50%.',
                icon: <Cpu className="text-zinc-400" />
            }
        ]
    },
    {
        title: 'Universal Memory',
        items: [
            {
                term: 'Merkle HyperDAG',
                definition: 'A content-addressed Directed Acyclic Graph providing tamper-proof provenance for every agent thought, decision, and generated artifact.',
                icon: <Network className="text-amber-500" />
            },
            {
                term: 'GNN Semantic RAG',
                definition: 'Retrieval-Augmented Generation powered by Graph Neural Networks, mapping complex relationships between themes and episodes across missions.',
                icon: <BookOpen className="text-sky-400" />
            },
            {
                term: 'ANFIS/LASSO Routing',
                definition: 'Adaptive Neuro-Fuzzy Inference with LASSO feature selection. Dynamically routes tasks to the most efficient LLM based on risk and complexity.',
                icon: <Zap className="text-blue-400" />
            },
            {
                term: 'Evergreen Genesis Loop',
                definition: 'An autonomous proactive cycle where agents identify market gaps and seed their own productive missions based on web-aware trends.',
                icon: <Sparkles className="text-purple-400" />
            },
            {
                term: 'Cognitive Sovereignty Bridge',
                definition: 'The protocol ensuring that agent actions strictly adhere to the Trinity Constitution while maintaining operational autonomy from central authority.',
                icon: <Globe className="text-emerald-400" />
            }
        ]
    }
];

export default function DefinitionsPage() {
    return (
        <div className="min-h-screen bg-obsidian-base pt-32 pb-16 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-16">
                    <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tighter">
                        Glossary of <span className="text-accent-violet">Truth</span>
                    </h1>
                    <p className="text-zinc-400 text-xl leading-relaxed">
                        The protocols and technologies powering the world's first antifragile, multi-agent AI environment. Built for absolute integrity and radical efficiency.
                    </p>
                </div>

                <div className="space-y-20">
                    {GLOSSARY_CATEGORIES.map((category) => (
                        <div key={category.title}>
                            <h2 className="text-sm font-black text-zinc-500 uppercase tracking-[0.4em] mb-8 flex items-center gap-4">
                                <span>{category.title}</span>
                                <div className="h-px bg-white/5 flex-1" />
                            </h2>
                            <div className="grid grid-cols-1 gap-6">
                                {category.items.map((item) => (
                                    <div key={item.term} className="p-8 rounded-3xl border border-white/5 bg-obsidian-elevated/40 hover:border-white/10 transition-all group">
                                        <div className="flex flex-col md:flex-row gap-8">
                                            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-white/10 transition-colors">
                                                {item.icon}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight group-hover:text-accent-violet transition-colors">
                                                    {item.term}
                                                </h3>
                                                <p className="text-zinc-400 leading-relaxed text-lg">
                                                    {item.definition}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-24 p-12 rounded-[3rem] bg-gradient-to-br from-violet-600/10 to-cyan-600/10 border border-white/5 text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-violet-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h3 className="text-2xl font-bold text-white mb-4 relative">Open Source & Verifiable</h3>
                    <p className="text-zinc-400 mb-10 max-w-2xl mx-auto relative text-lg">
                        We don't expect you to take our word for it. Every protocol mentioned above is open-source and ready for scrutiny by the global community.
                    </p>
                    <a
                        href="https://github.com/DealAppSeo"
                        target="_blank"
                        className="inline-flex items-center gap-3 px-10 py-4 rounded-full bg-white text-black font-black hover:bg-zinc-200 transition-all active:scale-95 relative"
                    >
                        Visit the Hub on GitHub
                    </a>
                </div>
            </div>
        </div>
    );
}
