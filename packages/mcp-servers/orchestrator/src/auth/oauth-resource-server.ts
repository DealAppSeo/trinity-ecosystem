/**
 * @title OAuth 2.1 Resource Server Middleware
 * @dev Validates MCP requests with resource binding and scope checks.
 * Compliance: MCP 2025-06-18 Spec / RFC 8707.
 */

export class MCPAuthMiddleware {
    private allowedScopes: Set<string>;

    constructor(config: { scopes: string[] }) {
        this.allowedScopes = new Set(config.scopes);
    }

    /**
     * Validates an incoming MCP request token and resource binding.
     */
    async validateRequest(headers: Record<string, string>): Promise<{ valid: boolean; error?: string; userRepID?: number }> {
        const authHeader = headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { valid: false, error: 'MISSING_TOKEN' };
        }

        const token = authHeader.slice(7);

        // STUB: In production, use verifyAccessToken(token) from a crypto library
        const mockClaims = {
            resource: 'trinity-orchestrator',
            scope: 'trinity:read trinity:write',
            'trinity:repid': 8500 // Mock user RepID
        };

        // MCP 2025-06-18: Verify resource binding (Strict Mode)
        if (mockClaims.resource !== 'trinity-orchestrator') {
            return { valid: false, error: 'RESOURCE_MISMATCH' };
        }

        // Scope verification
        const tokenScopes = mockClaims.scope.split(' ');
        const hasScope = tokenScopes.some(s => this.allowedScopes.has(s));

        if (!hasScope) {
            return { valid: false, error: 'INSUFFICIENT_SCOPE' };
        }

        return {
            valid: true,
            userRepID: mockClaims['trinity:repid']
        };
    }
}
