import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { EcosystemGrid } from '@/components/EcosystemGrid';
import { AgentGrid } from '@/components/AgentGrid';
import { Button } from '@/components/ui/Button';
import { VoiceInput } from '@/components/VoiceInput';
import { TelegramLoginWidget } from '@/components/ui/TelegramLoginWidget';
import { Sparkles } from 'lucide-react';
export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  // Fetch real data
  const { data: apps } = await supabase.from('ecosystem_apps').select('*');
  const { data: agentsData } = await supabase.from('agent_status').select('*');
  const agents = agentsData ? agentsData.slice(0, 15) : []; // Safety slice but not a hard DB limit
  const { data: cost } = await supabase.from('cost_tracking').select('*').order('date', { ascending: false }).limit(1).single();

  const traditionalCost = cost?.traditional_cost ?? 847.00;
  const trinityCost = cost?.trinity_cost ?? 0.47;

  return (
    <main className="min-h-screen bg-obsidian-base pt-20 pb-16">

      {/* HERO SECTION */}
      <section className="relative px-6 py-24 md:py-32 flex flex-col items-center justify-center text-center overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-violet/10 rounded-full blur-[120px] -z-10" />

        <h1 className="text-4xl md:text-7xl font-black text-text-primary mb-6 tracking-tighter max-w-5xl leading-[1.1]">
          Orchestrate <br />
          <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Autonomous Intelligence</span>
        </h1>

        <p className="text-xl md:text-2xl text-text-secondary mb-12 max-w-3xl leading-relaxed">
          The world's first <span className="text-status-online font-bold">Antifragile</span> agentic operating system.
          12 specialized agents, one unified mission: solving your most complex problems at 1% of the cost.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md mb-8">
          <Link href="/join" className="w-full">
            <Button className="w-full text-lg py-6 shadow-glow-violet">
              Get Early Access
            </Button>
          </Link>
          <Link href="/pulse/conductor" className="w-full">
            <Button variant="secondary" className="w-full text-lg py-6">
              Launch Controller
            </Button>
          </Link>
        </div>

        {/* VIRAL ENTRY POINT */}
        <div className="mb-12">
          <p className="text-sm text-text-muted mb-4 uppercase tracking-widest font-mono">Instant Access via</p>
          <TelegramLoginWidget />
        </div>

        {/* VOICE FIRST ENTRY POINT */}
        <div className="w-full max-w-md mb-16 animate-fade-in-up">
          <VoiceInput onResult={(text) => console.log('Voice Search:', text)} />
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-text-muted font-mono">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-status-online rounded-full" />
            12 Specialized Agents
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-status-working rounded-full" />
            ANFIS Optimized
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gold rounded-full" />
            Byzantine Fault Tolerance
          </span>
        </div>
      </section>

      {/* THE WHY SECTION */}
      <section className="px-6 py-24 container mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary leading-tight">
              AI shouldn't lie. <br />
              <span className="text-accent-violet">Truth is the new gold.</span>
            </h2>
            <div className="space-y-4 text-text-secondary text-lg">
              <p>
                Today's AI is often a "black box" that hallucinates. It's expensive, biased, and opaque.
              </p>
              <p>
                We built the <span className="text-white font-bold">Symphony</span> to provide <span className="text-status-online font-bold">Fact-Checked Intelligence</span>. By orchestrating a swarm of specialized agents that verify each other, we deliver 100x efficiency with absolute integrity.
              </p>
            </div>
          </div>

          <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/10 bg-obsidian-elevated p-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent" />
            <div className="relative text-center">
              <Sparkles className="w-12 h-12 text-accent-violet mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">BFT Reasoning</h3>
              <p className="text-sm text-text-muted">High-integrity consensus across 12 unique agent perspectives.</p>
            </div>
          </div>
        </div>
      </section>

      {/* COST COMPARISON */}
      <section className="px-6 py-16 bg-obsidian-surface border-y border-obsidian-border">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-8 rounded-2xl bg-obsidian-elevated border border-obsidian-border/50">
            <div className="text-center md:text-left">
              <h3 className="text-text-secondary text-sm uppercase tracking-wider mb-1">Traditional Operation</h3>
              <p className="text-4xl font-mono text-text-muted line-through decoration-red-500/50">
                ${traditionalCost.toFixed(2)}<span className="text-base text-text-muted/50">/day</span>
              </p>
            </div>

            <div className="text-3xl">➔</div>

            <div className="text-center md:text-right">
              <h3 className="text-accent-violet text-sm uppercase tracking-wider mb-1 font-bold">ANFIS Routing (v2)</h3>
              <p className="text-5xl font-mono text-status-online font-bold shadow-glow-gold">
                ${trinityCost.toFixed(2)}<span className="text-base text-status-online/70">/day</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AGENT SYMPHONY PREVIEW */}
      <section className="px-6 py-24 container mx-auto">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-text-primary mb-4">The Symphony</h2>
          <p className="text-text-secondary max-w-2xl mx-auto">
            12 autonomous specialized agents working in concert. No scripts. No human intervention.
            Self-healing via Survivor Protocols.
          </p>
        </div>

        <AgentGrid agents={agents || []} />

        <div className="mt-12 text-center">
          <Link href="/pulse/watch" className="text-accent-violet hover:text-accent-violet-hover font-medium flex items-center justify-center gap-2 group">
            Watch them work live
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </section>

      {/* ECOSYSTEM APPS */}
      <section className="px-6 py-24 bg-obsidian-surface border-t border-obsidian-border">
        <div className="container mx-auto">
          <div className="mb-16 md:flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold text-text-primary mb-4">Powered by Trinity</h2>
              <p className="text-text-secondary max-w-xl">
                A growing constellation of applications built on our ethical AI framework.
              </p>
            </div>
            <Link href="/join" className="hidden md:block">
              <Button variant="secondary">Submit Your App</Button>
            </Link>
          </div>

          <EcosystemGrid apps={apps || []} />

          <div className="mt-12 md:hidden text-center">
            <Link href="/join">
              <Button variant="secondary" className="w-full">Submit Your App</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* VIRAL REPUTATION SECTION */}
      <section className="px-6 py-24 container mx-auto">
        <div className="p-12 rounded-[2.5rem] bg-gradient-to-br from-obsidian-elevated to-obsidian-surface border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] -z-10" />

          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-8 leading-tight">
              Privacy-Preserving <br />
              <span className="text-cyan-400">Social Proof</span>
            </h2>
            <p className="text-xl text-text-secondary mb-10">
              Your reputation is your equity. With **ZKP RedpID**, shared truths are verified without leaking your data. Tap into a global network of conductors and earn rewards for every successful orchestration.
            </p>

            <div className="flex flex-wrap gap-8">
              <div className="space-y-2">
                <div className="text-3xl font-bold text-white tracking-tighter">100%</div>
                <div className="text-xs uppercase tracking-widest text-text-muted font-mono">Verifiable</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-white tracking-tighter">ZERO</div>
                <div className="text-xs uppercase tracking-widest text-text-muted font-mono">Data Leakage</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-white tracking-tighter">VIRAL</div>
                <div className="text-xs uppercase tracking-widest text-text-muted font-mono">Expansion</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 py-32 text-center max-w-4xl mx-auto">
        <h2 className="text-4xl md:text-6xl font-black text-text-primary mb-8 tracking-tight">
          Ready to Conduct the <br />
          <span className="text-accent-violet">Global Swarm?</span>
        </h2>
        <p className="text-xl text-text-secondary mb-12 leading-relaxed">
          Join 8,000+ conductors who are leveraging the AI Trinity Symphony to build the future.
          The next era of intelligence is decentralized.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link href="/join" className="group relative w-full sm:w-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
            <Button size="lg" className="relative px-12 py-8 text-xl w-full sm:w-auto">
              Initialize Identity
            </Button>
          </Link>
          <TelegramLoginWidget />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 border-t border-obsidian-border bg-obsidian-surface text-center">
        <p className="text-text-muted text-sm">
          © 2026 AI Trinity Symphony. Built for the future of humanity.
        </p>
      </footer>
    </main>
  );
}
