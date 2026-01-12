"use client";

import { useEffect } from "react";
import { logRuntimeError } from "@/lib/error_logger";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to Swarm Memory
        logRuntimeError(error);
    }, [error]);

    return (
        <html>
            <body className="bg-black text-white flex items-center justify-center min-h-screen">
                <div className="text-center p-8 border border-red-500/30 bg-red-900/10 rounded-lg max-w-md">
                    <h2 className="text-2xl font-bold text-red-500 mb-4">System Critical Failure</h2>
                    <p className="text-gray-400 mb-6">
                        The Trinity Neural Network encountered an unrecoverable error.
                        The incident has been logged to Swarm Memory for analysis.
                    </p>
                    <div className="font-mono text-xs text-red-300 bg-black/50 p-4 rounded mb-6 text-left overflow-auto max-h-40">
                        {error.message}
                    </div>
                    <button
                        onClick={() => reset()}
                        className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded transition-colors"
                    >
                        Attempt System Reboot
                    </button>
                </div>
            </body>
        </html>
    );
}
