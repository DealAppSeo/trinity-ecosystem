
import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function seedGraph() {
    console.log('🕸️ Seeding Trinity Knowledge Graph...');

    if (!process.env.NEO4J_URI) {
        console.error('❌ NEO4J_URI missing. Skipping graph seed.');
        return;
    }

    const driver = neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(
            process.env.NEO4J_USER || 'neo4j',
            process.env.NEO4J_PASSWORD || 'password'
        )
    );

    const session = driver.session();

    try {
        await session.writeTransaction(async (tx) => {
            // 1. Create Squads
            const squads = ['AlphaSquad', 'BetaSquad', 'GammaSquad', 'Orchestration'];
            for (const squad of squads) {
                await tx.run('MERGE (s:Squad {name: $name})', { name: squad });
            }

            // 2. Create Agents and link to Squads
            const agents = [
                { id: 'trinity-torch', squad: 'AlphaSquad', virtue: 'TRUE' },
                { id: 'trinity-veritas', squad: 'AlphaSquad', virtue: 'TRUE' },
                { id: 'trinity-gcm', squad: 'AlphaSquad', virtue: 'TRUE' },
                { id: 'trinity-mel', squad: 'BetaSquad', virtue: 'LOVELY' },
                { id: 'trinity-chesed', squad: 'BetaSquad', virtue: 'LOVELY' },
                { id: 'trinity-apm', squad: 'BetaSquad', virtue: 'LOVELY' },
                { id: 'trinity-sophia', squad: 'GammaSquad', virtue: 'EXCELLENT' },
                { id: 'trinity-nexus', squad: 'GammaSquad', virtue: 'EXCELLENT' },
                { id: 'trinity-hdm', squad: 'GammaSquad', virtue: 'EXCELLENT' }
            ];

            for (const agent of agents) {
                await tx.run(`
                    MERGE (a:Agent {id: $id})
                    MERGE (s:Squad {name: $squad})
                    MERGE (v:Virtue {name: $virtue})
                    MERGE (a)-[:MEMBER_OF]->(s)
                    MERGE (a)-[:GUIDED_BY]->(v)
                `, agent);
            }

            console.log('✅ Base nodes and relationships seeded.');
        });
    } catch (e: any) {
        console.error('❌ Seeding failed:', e.message);
    } finally {
        await session.close();
        await driver.close();
    }

    console.log('🏁 Graph seed complete.');
}

seedGraph();
