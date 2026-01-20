const { execSync } = require('child_process');

try {
    const token = '0b11715c-4117-4a2d-b55d-7c09bc6c1815';
    // Use the RAILIWAY_TOKEN for the CLI
    process.env.RAILWAY_TOKEN = token;

    console.log('Listing Railway Services...');
    const result = execSync('npx -y @railway/cli list', { stdio: 'inherit' });
} catch (e) {
    console.error('Failed to list Railway services:', e.message);
}
