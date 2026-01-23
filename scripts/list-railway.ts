import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listRailway() {
    const token = process.env.RAILWAY_API_TOKEN;
    if (!token) {
        console.error('❌ RAILWAY_API_TOKEN not found in .env.local');
        return;
    }

    const query = `
        query {
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

    try {
        const response = await fetch('https://backboard.railway.app/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        if (data.errors) {
            console.error('Railway API Errors:', JSON.stringify(data.errors, null, 2));
            return;
        }

        console.log('--- Railway Projects & Services ---');
        data.data.projects.nodes.forEach((project: any) => {
            console.log(`\nProject: ${project.name} (${project.id})`);
            console.log('  Services:');
            project.services.nodes.forEach((service: any) => {
                console.log(`    - ${service.name} (${service.id})`);
            });
            console.log('  Environments:');
            project.environments.nodes.forEach((env: any) => {
                console.log(`    - ${env.name} (${env.id})`);
            });
        });
    } catch (e: any) {
        console.error('Error fetching Railway data:', e.message);
    }
}

listRailway();
