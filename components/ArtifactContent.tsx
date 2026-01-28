'use client';

import React from 'react';
import MermaidRenderer from './MermaidRenderer';

interface ArtifactContentProps {
    content: string;
    type?: string;
}

const ArtifactContent: React.FC<ArtifactContentProps> = ({ content, type }) => {
    if (!content) return <div className="text-gray-500 italic">No content available.</div>;

    // Regex to find mermaid blocks (either fenced or raw)
    const isMermaid = (text: string) => {
        const trimmed = text.trim();
        return (
            trimmed.startsWith('graph ') ||
            trimmed.startsWith('graph\n') ||
            trimmed.startsWith('sequenceDiagram') ||
            trimmed.startsWith('classDiagram') ||
            trimmed.startsWith('stateDiagram') ||
            trimmed.startsWith('erDiagram') ||
            trimmed.startsWith('gantt') ||
            trimmed.startsWith('pie') ||
            trimmed.startsWith('flowchart') ||
            trimmed.startsWith('gitGraph') ||
            trimmed.includes('```mermaid')
        );
    };

    if (isMermaid(content)) {
        // Extract block if fenced
        let cleanedContent = content;
        const match = content.match(/```mermaid\n([\s\S]*?)\n```/);
        if (match) {
            cleanedContent = match[1];
        } else if (content.includes('```mermaid')) {
            // Fallback for missing newline
            cleanedContent = content.replace(/```mermaid\s*/, '').replace(/```\s*$/, '');
        }

        return <MermaidRenderer chart={cleanedContent.trim()} />;
    }

    return (
        <div className="whitespace-pre-wrap font-mono text-sm text-gray-300 leading-relaxed">
            {content}
        </div>
    );
};

export default ArtifactContent;
