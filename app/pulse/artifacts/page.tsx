'use client';

export default function ArtifactsPage() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Artifact Library</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0B0B0F]/60 p-8 rounded-xl border border-white/10 flex flex-col items-center justify-center text-center h-64">
                    <p className="text-zinc-500 mb-2">No artifacts generated yet.</p>
                    <p className="text-xs text-zinc-600">Agents will deposit files here upon mission completion.</p>
                </div>
            </div>
        </div>
    );
}
