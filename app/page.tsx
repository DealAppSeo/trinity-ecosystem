import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { EcosystemGrid } from '@/components/EcosystemGrid';
import { AgentGrid } from '@/components/AgentGrid';
import { Button } from '@/components/ui/Button';
import { VoiceInput } from '@/components/VoiceInput';
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

        <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-2 tracking-tight max-w-4xl leading-tight">
          Welcome to the <br />
          <span className="text-accent-violet">Founders App</span>
        </h1>

        <div className="flex flex-col items-center mb-10 animate-fade-in">
          <span className="text-sm font-mono text-text-muted uppercase tracking-widest mb-4">Powered By</span>
          <div className="relative w-[300px] h-[100px] md:w-[500px] md:h-[160px]">
            <Image
              src="/trinity-symphony.png"
              alt="AI Trinity Symphony"
              fill
              className="object-contain drop-shadow-[0_0_15px_rgba(124,58,237,0.3)]"
              priority
            />
          </div>
        </div>

        <p className="text-xl text-text-secondary mb-12 max-w-2xl leading-relaxed">
          The Trinity Symphony orchestrates autonomous agents to solve complex problems at
          <span className="text-text-primary font-semibold"> fraction of the cost</span>.
          Helping people help people.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mb-12">
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

        {/* VOICE FIRST ENTRY POINT */}
        <div className="w-full max-w-md mb-16 animate-fade-in-up">
          <VoiceInput />
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

      {/* FINAL CTA */}
      <section className="px-6 py-32 text-center">
        <h2 className="text-4xl font-bold text-text-primary mb-6">Ready to Conduct?</h2>
        <p className="text-text-secondary mb-10 max-w-xl mx-auto">
          Join the revolution of safe, affordable, and democratic AI.
        </p>
        <Link href="/join">
          <Button size="lg" className="px-12 text-lg shadow-glow-violet hover:shadow-glow-violet/50">
            Initialize Identity
          </Button>
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 border-t border-obsidian-border bg-obsidian-surface text-center">
        <p className="text-text-muted text-sm">
          © 2026 Trinity Ecosystem. Built for the future of humanity.
        </p>
      </footer>
    </main>
  );
}
