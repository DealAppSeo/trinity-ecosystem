require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'VERITAS'], { stdio: 'inherit', shell: true });
