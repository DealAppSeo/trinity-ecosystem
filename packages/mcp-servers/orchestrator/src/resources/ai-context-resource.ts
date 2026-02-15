/**
 * @title AI Context Resource
 * @dev Exposes AI_CONTEXT.md as a versioned MCP Resource for agent coordination.
 * Compliance: MCP 2025-11-25 Resource spec.
 */

export const aiContextResource = {
    uri: 'trinity://ai-context/latest',
    name: 'Trinity AI Context',
    description: 'Single source of truth for Trinity Symphony agent coordination and state.',
    mimeType: 'text/markdown',

    /**
     * Reads the AI_CONTEXT.md content.
     * Supports fetching from GitHub with local fallback for offline-first resilience.
     */
    async read(uri: string): Promise<any> {
        const repoUrl = 'https://raw.githubusercontent.com/DealAppSeo/trinity-ecosystem/main/AI_CONTEXT.md';

        try {
            // Priority: Network -> Local Cache
            const response = await fetch(repoUrl);
            if (!response.ok) throw new Error('Network fetch failed');
            const text = await response.text();

            return {
                uri,
                mimeType: 'text/markdown',
                text,
                metadata: {
                    source: 'github',
                    timestamp: new Date().toISOString(),
                    version: 'latest'
                }
            };
        } catch (error) {
            console.warn('AIContextResource: Network unavailable, falling back to local source.');
            // In a real implementation, this would read from the local filesystem or IndexedDB
            return {
                uri,
                mimeType: 'text/markdown',
                text: '# AI_CONTEXT.md (Local Cache)\n\nOffline access enabled.',
                metadata: {
                    source: 'local-cache',
                    timestamp: new Date().toISOString(),
                    version: 'stale'
                }
            };
        }
    }
};
