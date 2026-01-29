
/**
 * [ANTIGRAVITY] Prototyping Engine
 * Provides "Google Stitch" inspired boilerplate and design tokens for rapid agentic artifact creation.
 */

export interface PrototypingTemplate {
    title: string;
    description: string;
    files: { path: string; content: string; type: 'code' | 'style' | 'document' }[];
}

export const STITCH_TEMPLATES: Record<string, PrototypingTemplate> = {
    'premium-dashboard-core': {
        title: 'Premium Glassmorphism Dashboard',
        description: 'A flagship dashboard layout with HSL-tailored colors, glassmorphism sidebar, and responsive grid.',
        files: [
            {
                path: 'layouts/DashboardLayout.tsx',
                type: 'code',
                content: `
import React from 'react';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 flex font-sans">
      <aside className="w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl p-6 hidden lg:block">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Trinity</h1>
        <nav className="mt-12 space-y-4">
          <div className="p-3 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition">Overview</div>
          <div className="p-3 opacity-60 hover:opacity-100 cursor-pointer transition">Agents</div>
          <div className="p-3 opacity-60 hover:opacity-100 cursor-pointer transition">Vault</div>
        </nav>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-12">
          <h2 className="text-3xl font-light">System <span className="font-bold text-blue-400">Pulse</span></h2>
          <div className="flex space-x-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20" />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};
`
            },
            {
                path: 'styles/globals.css',
                type: 'style',
                content: `
:root {
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --accent-blue: #60a5fa;
  --accent-purple: #a855f7;
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.glass-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.2);
}
`
            }
        ]
    },
    'agent-telemetry-node': {
        title: 'Agent Telemetry Component',
        description: 'Interactive telemetry display for real-time agent monitoring.',
        files: [
            {
                path: 'components/TelemetryCard.tsx',
                type: 'code',
                content: `
import React from 'react';

export const TelemetryCard = ({ agent, status, metrics }: any) => {
  return (
    <div className="glass-card p-6 min-w-[300px]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold">{agent}</h3>
          <span className="text-xs uppercase tracking-widest text-blue-400 font-mono">{status}</span>
        </div>
        <div className="px-2 py-1 rounded text-[10px] bg-blue-500/20 text-blue-300 font-bold">REPID: {metrics.reputation}</div>
      </div>
      <div className="space-y-2 mt-6">
        <div className="flex justify-between text-sm">
          <span className="opacity-50 text-xs">Processing Power</span>
          <span className="font-mono">{metrics.cpu}%</span>
        </div>
        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
          <div className="bg-blue-400 h-full transition-all duration-1000" style={{ width: metrics.cpu + '%' }} />
        </div>
      </div>
    </div>
  );
};
`
            }
        ]
    }
};

export class PrototypingEngine {
    static getTemplate(key: string): PrototypingTemplate | null {
        return STITCH_TEMPLATES[key] || null;
    }

    static listTemplates(): string[] {
        return Object.keys(STITCH_TEMPLATES);
    }
}
