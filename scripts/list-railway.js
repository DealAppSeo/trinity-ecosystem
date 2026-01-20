// Using built-in fetch in Node v22

async function listRailwayServices() {
    const token = '0b11715c-4117-4a2d-b55d-7c09bc6c1815';
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
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error fetching Railway services:', e.message);
    }
}

listRailwayServices();
