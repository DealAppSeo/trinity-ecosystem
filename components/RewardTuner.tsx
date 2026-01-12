'use client';

import { useState } from 'react';
import { ScienceClient } from '@/lib/science/ScienceClient';
import { Settings, Save, Zap } from 'lucide-react';

export function RewardTuner() {
    // Default weights (Client-side initially, should fetch in v2)
    const [weights, setWeights] = useState({
        network_need: 1.0,
        saturation: 1.0,
        diversity: 1.0
    });
    const [loading, setLoading] = useState(false);

    const handleUpdate = async () => {
        setLoading(true);

        try {
            // Call our own API route proxy instead of external URL directly
            const response = await fetch('/api/anfis/weights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weights })
            });

            if (!response.ok) throw new Error('Update failed');

            // Visual feedback could be better (toast), but alert is safe for MVP
            // alert("Reward Weights Updated!");
        } catch (e) {
            console.error(e);
            alert("Failed to update: " + (e as Error).message);
        }
        setLoading(false);
    };

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group">
            {/* Ambient Background Effect */}
            <div className="absolute inset-0 bg-purple-900/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    <h2 className="text-sm font-bold text-zinc-100">Reward Logic (ANFIS)</h2>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">v10.2</div>
            </div>

            <div className="space-y-4 relative z-10">
                {Object.entries(weights).map(([key, val]) => (
                    <div key={key}>
                        <div className="flex justify-between text-[10px] text-zinc-400 mb-1 uppercase tracking-wider font-bold">
                            <span>{key.replace('_', ' ')}</span>
                            <span className={val > 1.0 ? 'text-green-400' : 'text-zinc-500'}>{val.toFixed(1)}x</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="2" step="0.1"
                            value={val}
                            onChange={e => setWeights({ ...weights, [key]: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                        />
                    </div>
                ))}
            </div>

            <button
                onClick={handleUpdate}
                disabled={loading}
                className="mt-6 w-full py-2 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 text-[10px] font-bold tracking-widest rounded border border-purple-800/50 transition-all flex items-center justify-center gap-2 uppercase"
            >
                <Save className="w-3 h-3" />
                {loading ? 'Transmitting...' : 'Update Weights'}
            </button>
        </div>
    );
}
