'use client';

export default function NewMissionPage() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Deploy New Mission</h1>
                <p className="text-zinc-400">Configure and launch an autonomous swarm objective.</p>
            </div>

            <div className="bg-[#0B0B0F]/60 backdrop-blur-sm rounded-xl p-8 border border-white/10 space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-300">Mission Name</label>
                    <input type="text" placeholder="e.g., Q1 Growth Strategy" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 focus:outline-none transition-colors" />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-300">Mission Objective</label>
                    <textarea placeholder="Describe the mission objective in detail..." className="w-full h-32 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 focus:outline-none transition-colors resize-none" />
                </div>

                <button className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.02]">
                    Launch Swarm
                </button>
            </div>
        </div>
    );
}
