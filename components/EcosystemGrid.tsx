'use client';

import { Card } from "@/components/ui/Card";
import { EcosystemApp } from "@/types";

interface EcosystemGridProps {
    apps: EcosystemApp[];
}

export function EcosystemGrid({ apps }: EcosystemGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((app) => (
                <a href={app.url} key={app.slug} target="_blank" rel="noopener noreferrer" className="block h-full group">
                    <Card hoverable className="h-full p-6 flex flex-col transition-all group-hover:border-accent-violet/50">
                        <div className="flex items-start justify-between mb-4">
                            <span className="text-4xl bg-obsidian-elevated p-3 rounded-lg">{app.icon_emoji}</span>
                            <span className={`px-2 py-1 rounded text-xs font-mono border ${app.status === 'live' ? 'border-status-online text-status-online bg-status-online/10' :
                                    app.status === 'beta' ? 'border-status-working text-status-working bg-status-working/10' :
                                        'border-text-muted text-text-muted'
                                }`}>
                                {app.status.toUpperCase()}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-text-primary mb-2 group-hover:text-accent-violet transition-colors">
                            {app.name}
                        </h3>
                        <p className="text-text-secondary text-sm leading-relaxed">
                            {app.tagline}
                        </p>
                    </Card>
                </a>
            ))}
        </div>
    );
}
