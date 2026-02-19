
import { RailwayMCP } from '../lib/mcp/servers/RailwayMCP';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function auditRailway() {
    const r = new RailwayMCP();
    await r.initialize();
    try {
        const servicesStr = await r.callTool('list_railway_services', {});
        const services = JSON.parse(servicesStr);
        console.log('--- RAILWAY SERVICES ---');
        console.log(JSON.stringify(services, null, 2));

        if (services.projects?.nodes?.[0]) {
            const projectId = services.projects.nodes[0].id;
            const envId = services.projects.nodes[0].environments.nodes[0].id;
            const serviceId = services.projects.nodes[0].services.nodes[0].id;

            console.log(`\n--- VARIABLES FOR SERVICE [${services.projects.nodes[0].services.nodes[0].name}] ---`);
            const varsStr = await r.callTool('list_railway_variables', { service_id: serviceId, environment_id: envId });
            console.log(varsStr);
        }
    } catch (e: any) {
        console.error('Audit failed:', e.message);
    }
}

auditRailway();
