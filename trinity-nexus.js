require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'NEXUS'], { stdio: 'inherit', shell: true });
