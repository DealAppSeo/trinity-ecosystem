/**
 * @title RepID Dashboard MCP App
 * @dev returns interactive UI components for Claude Desktop/Goose.
 * Compliance: Jan 2026 MCP Apps Spec.
 */

export const RepIDDashboardApp = {
    name: 'trinity-repid-dashboard',
    render: (props: { userRepID: number; tier: string }) => {
        return {
            type: 'container',
            attributes: { 'aria-label': 'Trinity RepID Dashboard' },
            children: [
                {
                    type: 'gauge',
                    value: props.userRepID / 10000,
                    label: `Tier: ${props.tier}`,
                    color: props.userRepID > 5000 ? 'green' : 'orange'
                },
                {
                    type: 'button',
                    label: 'Export ZKP Proof',
                    action: 'export_proof'
                }
            ]
        };
    }
};
