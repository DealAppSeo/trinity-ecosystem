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
            },
            {
                name: 'list_railway_variables',
                description: 'List all environment variables for a specific service and environment.',
                schema: {
                    type: 'object',
                    properties: {
                        service_id: { type: 'string' },
                        environment_id: { type: 'string' }
                    },
                    required: ['service_id', 'environment_id']
                },
                execute: async (args: any) => this.callTool('list_railway_variables', args)
            },
            {
                name: 'upsert_railway_variable',
                description: 'Upsert (create or update) an environment variable for a service.',
                schema: {
                    type: 'object',
                    properties: {
                        service_id: { type: 'string' },
                        environment_id: { type: 'string' },
                        name: { type: 'string', description: 'The name of the variable (e.g. API_KEY)' },
                        value: { type: 'string', description: 'The value to set' }
                    },
                    required: ['service_id', 'environment_id', 'name', 'value']
                },
                execute: async (args: any) => this.callTool('upsert_railway_variable', args)
            },
            {
                name: 'get_infrastructure_health',
                description: 'Returns a summary of all Trinity services and their health on Railway.',
                schema: {
                    type: 'object',
                    properties: {}
                },
                execute: async () => this.callTool('get_infrastructure_health', {})
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

        if (toolName === 'list_railway_variables') {
            const { service_id, environment_id } = args;
            const query = `
                query variables($serviceId: String!, $environmentId: String!) {
                  variables(serviceId: $serviceId, environmentId: $environmentId)
                }
            `;
            const data = await this.fetchRailway(query, { serviceId: service_id, environmentId: environment_id });
            return JSON.stringify(data, null, 2);
        }

        if (toolName === 'upsert_railway_variable') {
            const { service_id, environment_id, name, value } = args;
            const mutation = `
                mutation variableUpsert($serviceId: String!, $environmentId: String!, $name: String!, $value: String!) {
                  variableUpsert(input: { serviceId: $serviceId, environmentId: $environmentId, name: $name, value: $value })
                }
            `;
            const data = await this.fetchRailway(mutation, { serviceId: service_id, environmentId: environment_id, name, value });
            return JSON.stringify({ success: !!data });
        }

        if (toolName === 'get_infrastructure_health') {
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
                          status
                        }
                      }
                    }
                  }
                }
            `;
            const data = await this.fetchRailway(query);
            const services = data.projects.nodes.flatMap((p: any) =>
                p.services.nodes.map((s: any) => ({ project: p.name, service: s.name, status: s.status }))
            );
            return JSON.stringify({ health: 'OK', services });
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
