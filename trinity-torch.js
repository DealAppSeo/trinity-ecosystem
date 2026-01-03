require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'TORCH'], { stdio: 'inherit', shell: true });
