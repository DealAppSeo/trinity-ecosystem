require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'NEXUS'], { stdio: 'inherit', shell: true });
