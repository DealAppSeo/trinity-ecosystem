'use client';

import { Server, Activity, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Service {
    name: string;
    status: string;
    cpu?: string;
    memory?: string;
}

interface InfraHealthProps {
    services?: Service[];
    status?: 'healthy' | 'warning' | 'error';
}

export function InfraHealthCard({ services = [], status = 'healthy' }: InfraHealthProps) {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Server className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">
                            Infrastructure Health
                        </h2>
                        <p className="text-[10px] text-zinc-500">RAILWAY ENGINE STATUS</p>
                    </div>
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border",
                    status === 'healthy' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                )}>
                    {status === 'healthy' ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {status.toUpperCase()}
                </div>
            </div>

            <div className="space-y-4">
                {services.length > 0 ? (
                    services.map((service, i) => (
                        <div key={i} className="flex flex-col gap-1.5 p-3 rounded-lg bg-black/40 border border-white/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-300 uppercase">{service.name}</span>
                                <span className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded uppercase font-mono border",
                                    service.status === 'RUNNING' ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-amber-400 border-amber-500/20 bg-amber-500/5"
                                )}>
                                    {service.status}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-1">
                                <div className="flex flex-col">
                                    <span className="text-[8px] text-zinc-600 uppercase">CPU</span>
                                    <span className="text-[10px] text-zinc-400 font-mono">{service.cpu || '0.1%'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[8px] text-zinc-600 uppercase">MEM</span>
                                    <span className="text-[10px] text-zinc-400 font-mono">{service.memory || '48MB'}</span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                        <Activity className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                        <p className="text-[10px] text-zinc-600 italic">No service data available.</p>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px]">
                <span className="text-zinc-600">Instance Count: {services.length}</span>
                <button className="text-blue-400 hover:underline">Manage Railway →</button>
            </div>
        </div>
    );
}
