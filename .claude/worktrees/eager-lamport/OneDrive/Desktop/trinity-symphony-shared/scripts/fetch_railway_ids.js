/**
 * Utility to fetch Railway Service IDs
 * Usage: RAILWAY_API_TOKEN=... node fetch_railway_ids.js
 */
const https = require('https');

const token = process.env.RAILWAY_API_TOKEN;
if (!token) {
    console.error('Please set RAILWAY_API_TOKEN environment variable');
    process.exit(1);
}

const query = `
query {
  projects {
    edges {
      node {
        name
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  }
}`;

const req = https.request('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.errors) {
                console.error('API Error:', json.errors[0].message);
                return;
            }

            const projects = json.data.projects.edges;
            console.log('\n--- RAILWAY SERVICE IDs ---\n');
            projects.forEach(p => {
                console.log(`Project: ${p.node.name}`);
                p.node.services.edges.forEach(s => {
                    console.log(`  '${s.node.name}': '${s.node.id}',`);
                });
            });
            console.log('\n--- COPY ABOVE MAP TO ConstitutionalAgentV4.js ---\n');
        } catch (e) {
            console.error('Parse Error', e);
        }
    });
});

req.write(JSON.stringify({ query }));
req.end();
