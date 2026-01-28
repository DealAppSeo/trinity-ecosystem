'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
    chart: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark', // Optimized for the Trinity black/gold/green aesthetic
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif',
            themeVariables: {
                primaryColor: '#10b981', // emerald-500
                primaryTextColor: '#fff',
                primaryBorderColor: '#059669',
                lineColor: '#10b981',
                secondaryColor: '#f59e0b', // amber-500
                tertiaryColor: '#1f2937', // gray-800
            }
        });
    }, []);

    useEffect(() => {
        const renderChart = async () => {
            if (!containerRef.current || !chart) return;

            try {
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                const { svg: renderedSvg } = await mermaid.render(id, chart.trim());
                setSvg(renderedSvg);
                setError(null);
            } catch (e: any) {
                console.error('[Mermaid] Render failed:', e);
                setError('Failed to render diagram. Check Mermaid syntax.');
            }
        };

        renderChart();
    }, [chart]);

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-mono my-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⚠️</span>
                    <span>{error}</span>
                </div>
                <pre className="mt-2 text-xs opacity-50 overflow-x-auto p-2 bg-black/50 rounded whitespace-pre-wrap">{chart}</pre>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="mermaid-container flex justify-center py-6 bg-black/40 rounded-xl border border-emerald-500/20 overflow-x-auto my-4 transition-all hover:border-emerald-500/40 shadow-inner"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

export default MermaidRenderer;
