import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * RailwayMCP Server
 * Empowers agents to monitor and manage the Trinity Infrastructure on Railway.
 * Enables self-healing, scaling, and operational transparency.
 */
export class RailwayMCP extends BaseMCP {
    private apiToken: string;
    private endpoint: string = 'https://backboard.railway.app/graphql';

    constructor() {
        super('Railway');
        this.apiToken = process.env.RAILWAY_API_TOKEN || '';
    }

    async connect(): Promise<void> {
        if (!this.apiToken) {
            console.warn('[RailwayMCP] RAILWAY_API_TOKEN is missing. Infrastructure tools will be unavailable.');
            return;
        }
        this.isConnected = true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'list_railway_services',
                description: 'List all projects, services, and their current deployment status in Railway.',
                schema: {
                    type: 'object',
                    properties: {
                        project_id: { type: 'string', description: 'Optional project ID to filter' }
                    }
                },
                execute: async (args: any) => this.callTool('list_railway_services', args)
            },
            {
                name: 'restart_railway_service',
                description: 'Trigger a restart (redeploy) for a specific Railway service.',
                schema: {
                    type: 'object',
                    properties: {
                        service_id: { type: 'string', description: 'The unique ID of the service to restart' },
                        environment_id: { type: 'string', description: 'The environment ID (e.g. production)' }
                    },
                    required: ['service_id', 'environment_id']
                },
                execute: async (args: any) => this.callTool('restart_railway_service', args)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (!this.isConnected) return "Railway API not connected. Check RAILWAY_API_TOKEN.";

        if (toolName === 'list_railway_services') {
            const query = `
                query projects {
                  projects {
                    nodes {
                      id
                      name
                      services {
                        nodes {
                          id
                          name
                        }
                      }
                      environments {
                        nodes {
                          id
                          name
                        }
                      }
                    }
                  }
                }
            `;
            const data = await this.fetchRailway(query);
            return JSON.stringify(data, null, 2);
        }

        if (toolName === 'restart_railway_service') {
            const { service_id, environment_id } = args;
            const mutation = `
                mutation serviceInstanceRestart($serviceId: String!, $environmentId: String!) {
                  serviceInstanceRestart(serviceId: $serviceId, environmentId: $environmentId)
                }
            `;
            const data = await this.fetchRailway(mutation, { serviceId: service_id, environmentId: environment_id });
            return JSON.stringify({ success: !!data, result: data });
        }

        throw new Error(`Tool ${toolName} not supported.`);
    }

    private async fetchRailway(query: string, variables: any = {}): Promise<any> {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await response.json();
        if (json.errors) {
            throw new Error(`Railway API Error: ${JSON.stringify(json.errors)}`);
        }
        return json.data;
    }
}
