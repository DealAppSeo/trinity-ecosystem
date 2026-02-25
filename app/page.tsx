import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AgentGrid } from '@/components/AgentGrid';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TelegramLoginWidget } from '@/components/ui/TelegramLoginWidget';
import { Sparkles, Shield, Cpu, Zap, Network, ChevronRight, Activity, Globe, Lock, ArrowRight, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  // Fetch real data
  const { data: agentsData } = await supabase.from('agent_status').select('*');
  const agents = agentsData ? agentsData.slice(0, 15) : [];
  const { data: cost } = await supabase.from('cost_tracking').select('*').order('date', { ascending: false }).limit(1).single();

  const traditionalCost = cost?.traditional_cost ?? 847.00;
  const trinityCost = cost?.trinity_cost ?? 0.47;

  return (
    <main className="min-h-screen bg-obsidian-base pt-20 pb-16">

      {/* AHA! MOMENT HERO */}
      <section className="relative px-4 md:px-6 py-20 md:py-40 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-accent-violet/5 rounded-full blur-[140px] -z-10" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-violet/10 border border-accent-violet/20 text-accent-violet text-[10px] font-black uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom duration-700">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-violet animate-pulse" />
          The Future of Decentralized Intelligence
        </div>

        <h1 className="text-4xl md:text-8xl font-black text-white mb-6 md:mb-8 tracking-tighter max-w-6xl leading-tight md:leading-[1.1] animate-in fade-in slide-in-from-bottom duration-1000">
          Safe, Ethical AI. <br />
          <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">60-80% Savings.</span>
        </h1>

        <p className="text-lg md:text-2xl text-zinc-400 mb-10 md:mb-12 max-w-3xl leading-relaxed animate-in fade-in slide-in-from-bottom duration-1000 delay-200 px-4">
          The AI Trinity Symphony combines specialized agents with <span className="text-white font-bold underline decoration-violet-500/50">Byzantine Fault Tolerance</span> to provide state-of-the-art results without the corporate tax.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 w-full max-w-2xl mb-12 animate-in fade-in slide-in-from-bottom duration-1000 delay-300 px-4">
          <Link href="https://github.com/DealAppSeo" target="_blank" className="w-full">
            <Button className="w-full text-lg py-7 shadow-glow-violet bg-violet-600 hover:bg-violet-500 border-0 flex items-center justify-center gap-2">
              <Network className="w-5 h-5" /> Join the GitHub
            </Button>
          </Link>
          <Link href="/pulse/conductor" className="w-full">
            <Button variant="secondary" className="w-full text-lg py-7 border-white/10 hover:bg-white/5 flex items-center justify-center gap-2">
              <ChevronRight className="w-5 h-5" /> Launch Controller
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-1000 delay-500">
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] font-black">Open-Source Truth • Ethical Intelligence</p>
          <div className="flex gap-6 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
            <Network size={24} className="text-white" />
            <Shield size={24} className="text-white" />
            <Cpu size={24} className="text-white" />
          </div>
        </div>
      </section>

      {/* BENEFITS GRID: FIXED HIGH-IMPACT CARDS */}
      <section className="px-6 py-24 bg-black relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-sm font-black text-accent-violet uppercase tracking-[0.4em] mb-4">Core Differentiators</h2>
            <p className="text-4xl md:text-5xl font-black text-white tracking-tighter">Why build with <span className="text-accent-violet">Trinity?</span></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-10 rounded-[2.5rem] border border-white/5 bg-obsidian-elevated/40 hover:border-violet-500/30 transition-all group relative overflow-hidden h-full flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Shield className="w-24 h-24 text-violet-500" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-8 border border-violet-500/20">
                <Shield className="w-7 h-7 text-violet-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">Unmatched Safety (BFT)</h3>
              <p className="text-zinc-400 leading-relaxed mb-8 flex-grow">
                Beyond typical "Guardrails." We use a 3-Ply Byzantine Fault Tolerant model (Executors, Verifiers, Consensus) to ensure every agent decision is factually true and ethically aligned.
              </p>
              <Link href="/wisdom/definitions" className="inline-flex items-center gap-2 text-violet-400 font-bold hover:text-violet-300 transition-colors uppercase text-xs tracking-widest">
                Learn how it works <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="p-10 rounded-[2.5rem] border border-white/5 bg-obsidian-elevated/40 hover:border-cyan-500/30 transition-all group relative overflow-hidden h-full flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Zap className="w-24 h-24 text-cyan-500" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-8 border border-cyan-500/20">
                <Zap className="w-7 h-7 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">60-80% Cost Efficiency</h3>
              <p className="text-zinc-400 leading-relaxed mb-8 flex-grow">
                While others run every task through expensive LLMs, we use ANFIS/LASSO routing and SLM clusters to achieve radical cost savings without sacrificing reasoning depth.
              </p>
              <Link href="/wisdom/definitions" className="inline-flex items-center gap-2 text-cyan-400 font-bold hover:text-cyan-300 transition-colors uppercase text-xs tracking-widest">
                See the cost audit <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="p-10 rounded-[2.5rem] border border-white/5 bg-obsidian-elevated/40 hover:border-emerald-500/30 transition-all group relative overflow-hidden h-full flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Lock className="w-24 h-24 text-emerald-500" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-8 border border-emerald-500/20">
                <Lock className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">Sovereign Identity (POL)</h3>
              <p className="text-zinc-400 leading-relaxed mb-8 flex-grow">
                Proof of Life (POL) verified by 4-Factor Authentication. We convert Digital Bound Tokens (DBT) into non-transferable Soulbound Tokens (SBT) for permanent, verifiable reputation.
              </p>
              <Link href="/wisdom/definitions" className="inline-flex items-center gap-2 text-emerald-400 font-bold hover:text-emerald-300 transition-colors uppercase text-xs tracking-widest">
                Verify your identity <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TECHNICAL CAROUSEL: ADDITIONAL VALUE FEATURES */}
      <section className="py-24 bg-obsidian-base overflow-hidden border-y border-white/5">
        <div className="px-6 mb-16 max-w-7xl mx-auto">
          <h2 className="text-sm font-black text-zinc-500 uppercase tracking-[0.4em] mb-4">Deep Tech Stack</h2>
          <p className="text-4xl font-black text-white tracking-tighter">Proprietary Protocols.</p>
        </div>

        <div className="flex gap-6 px-6 overflow-x-auto pb-12 scrollbar-none snap-x">
          {[
            {
              title: "Heterogeneous SLM Cluster",
              desc: "Fast, local, and energy-efficient LLM fallbacks.",
              icon: <Cpu className="text-blue-400" />
            },
            {
              title: "Merkle HyperDAG",
              desc: "Tamper-proof provenance for every agent thought.",
              icon: <Network className="text-amber-400" />
            },
            {
              title: "GNN Semantic RAG",
              desc: "Graph-based memory that never forgets context.",
              icon: <BookOpen className="text-cyan-400" />
            },
            {
              title: "Zero-Knowledge RepID",
              desc: "Private, verifiable social proof for AI agents.",
              icon: <Globe className="text-violet-400" />
            },
            {
              title: "Ripple Effect Protocol",
              desc: "Predicting sensitivities across the entire swarm.",
              icon: <Zap className="text-pink-400" />
            }
          ].map((item, idx) => (
            <div key={idx} className="min-w-[320px] md:min-w-[400px] p-8 rounded-[2rem] bg-obsidian-elevated/40 border border-white/5 snap-center hover:bg-white/5 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                {item.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">{item.title}</h3>
              <p className="text-zinc-500 leading-relaxed text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* THE "KNOW HOW" DEEP DIVE */}
      <section id="know-how" className="px-4 md:px-6 py-24 bg-obsidian-elevated/20 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="relative aspect-square md:aspect-video rounded-[3rem] overflow-hidden border border-white/10 bg-black/40 p-8 flex flex-col justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 blur-3xl -z-10" />
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0 border border-violet-500/30">
                    <Zap className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase text-sm tracking-widest mb-2">ANFIS & LASSO Routing</h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">Recursive Fuzzy Logic (ANFIS) combined with Sparse Optimization (LASSO) ensures we only use the compute we need. Significant cost efficiency via intelligent SLM clustering.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                    <BookOpen className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase text-sm tracking-widest mb-2">GNN Semantic RAG</h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">Forget simple vector search. We use Multi-Relational Graph Neural Networks to provide deep context that grows with every interaction.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center shrink-0 border border-emerald-500/30">
                    <Network className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase text-sm tracking-widest mb-2">Edge-First Sovereignty</h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">Your data stays local. Our agents run on edge-optimized clusters, syncing only state-hashes to the decentralized HyperDAG.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <h2 className="text-sm font-black text-accent-violet uppercase tracking-[0.4em]">The Secret Sauce</h2>
              <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-tight">
                State of the Art. <br />
                <span className="text-zinc-500">Without the Corporate Tax.</span>
              </h3>
              <p className="text-zinc-400 text-lg leading-relaxed">
                By combining never-before-combined formulas and decentralized infrastructure, we’ve built an ecosystem that scales with integrity. We use dual-repos with shared decentralized databases to maintain a "Shared Soul" across the swarm.
              </p>
              <div className="pt-4 flex flex-wrap gap-4">
                <Link href="https://github.com/DealAppSeo" target="_blank">
                  <Button className="bg-white text-black hover:bg-zinc-200 px-8 py-6 rounded-2xl font-black transition-all hover:scale-105 active:scale-95">
                    Explore Repos
                  </Button>
                </Link>
                <Link href="/join">
                  <Button variant="outline" className="border-white/10 hover:bg-white/5 px-8 py-6 rounded-2xl font-black">
                    Get Access
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE DEEP DIVE */}
      <section className="px-4 md:px-6 py-24 md:py-40 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-20 items-center">
            <div>
              <h2 className="text-sm font-black text-accent-violet uppercase tracking-[0.4em] mb-8">Architectural Truth</h2>
              <h3 className="text-4xl md:text-7xl font-black text-white mb-8 tracking-tighter leading-tight">
                The 3x3+3 <br /> <span className="text-zinc-500">Tiered Governance.</span>
              </h3>
              <p className="text-zinc-400 text-lg md:text-xl leading-relaxed mb-12">
                We don't trust a single model. We trust the <span className="text-white">Consensus.</span> Our architecture ensures that every input is processed by a diverse swarm of agents, cross-verified, and anchored in a tamper-proof Merkle DAG.
              </p>

              <ul className="space-y-6">
                {[
                  { title: "3 Core Orchestrators", desc: "Strategists that break down complex goals into tasks." },
                  { title: "3 Specialty Squads", desc: "Specialized agents for Code, Wisdom, and Impact." },
                  { title: "3 Sovereign Validators", desc: "Judicial agents that verify truth and safety." }
                ].map((item, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-accent-violet/20 border border-accent-violet/40 flex items-center justify-center shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full bg-accent-violet" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold">{item.title}</h4>
                      <p className="text-zinc-500 text-sm">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative w-full max-w-full overflow-hidden">
              <div className="absolute -inset-20 bg-accent-violet/10 rounded-full blur-[120px] -z-10" />
              <div className="p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] bg-obsidian-elevated/40 border border-white/10 backdrop-blur-xl relative overflow-hidden">
                <div className="flex items-center gap-2 mb-6 md:mb-8">
                  <span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-500/50" />
                  <span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-yellow-500/50" />
                  <span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-green-500/50" />
                  <span className="ml-2 md:ml-4 text-[8px] md:text-[10px] font-mono text-zinc-600 uppercase tracking-widest truncate">Protocol: SYMPHONY_BFT_V3</span>
                </div>

                <div className="space-y-4 font-mono text-[9px] md:text-[11px] text-zinc-400 leading-normal overflow-x-auto pb-4 scrollbar-none">
                  <div className="text-accent-violet"># Initialize Trinity Consensus</div>
                  <div>executor_ply(task_context) {'{'}</div>
                  <div className="pl-4">exec_a = family.anthropic.request(task)</div>
                  <div className="pl-4">exec_b = family.openai.request(task)</div>
                  <div className="pl-4">exec_c = family.google.request(task)</div>
                  <div className="pl-4 text-cyan-400 cursor-pointer hover:underline">return heterogeneous_merge(exec_a, exec_b, exec_c)</div>
                  <div>{'}'}</div>
                  <br />
                  <div className="text-accent-violet"># Verify via ZKP & Merkle DAG</div>
                  <div>function verify_truth(output) {'{'}</div>
                  <div className="pl-4">if (zkp_verify(output.reputation && merkle_anchor(output.hash))) {'{'}</div>
                  <div className="pl-4 text-emerald-400">commit_to_hyperdag(output.sbt_signature)</div>
                  <div className="pl-4">dispatch_symphony_event(APPROVED)</div>
                  <div className="pl-4">{'}'} else {'{'}</div>
                  <div className="pl-4 text-red-400">trigger_survivor_protocol(FAILURE_MODE)</div>
                  <div className="pl-4">{'}'}</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="px-4 md:px-6 py-20 md:py-32 mb-20 text-center max-w-7xl mx-auto">
        <div className="p-8 md:p-24 rounded-[3rem] md:rounded-[4rem] bg-gradient-to-br from-violet-600 to-indigo-900 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />

          <h2 className="text-4xl md:text-7xl font-black text-white mb-8 tracking-tighter leading-tight relative">
            Ready to Build?
          </h2>
          <p className="text-white/70 text-lg md:text-xl mb-12 max-w-2xl mx-auto relative font-medium">
            Join the decentralized ecosystem where AI integrity meets radical efficiency. No gatekeepers. Just open-source truth.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center relative items-center">
            <Link
              href="https://github.com/DealAppSeo"
              target="_blank"
              className="w-full md:w-auto px-10 py-5 bg-white text-indigo-900 font-black rounded-2xl text-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Network className="w-5 h-5" /> Visit GitHub
            </Link>
            <Link
              href="/join"
              className="w-full md:w-auto px-10 py-5 bg-transparent border-2 border-white/20 text-white font-black rounded-2xl text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 font-black text-white text-xl tracking-tighter">
            <div className="w-6 h-6 rounded-full bg-accent-violet" />
            AI TRINITY SYMPHONY
          </div>
          <div className="flex gap-8 text-sm font-bold text-zinc-500 uppercase tracking-widest">
            <Link href="/wisdom/definitions" className="hover:text-white transition-colors">Philosophy</Link>
            <Link href="/impact" className="hover:text-white transition-colors">Impact</Link>
            <a href="https://github.com/DealAppSeo" target="_blank" className="hover:text-white transition-colors">GitHub</a>
          </div>
          <div className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
            ver 8.1.3 • truths verified: 12,402
          </div>
        </div>
      </footer>
    </main>
  );
}
