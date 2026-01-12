
import { isMockMode } from "@/lib/supabase";

export function MockBanner() {
    if (!isMockMode) return null;

    return (
        <div className="fixed top-0 left-0 w-full bg-yellow-400 text-black text-xs font-bold text-center py-1 z-[100] shadow-sm">
            🚧 SIMULATION MODE: Using Anti-Fragile Mock Data.
            <a href="https://railway.app" target="_blank" className="underline ml-2 hover:text-white">Connect Database</a>
        </div>
    );
}
