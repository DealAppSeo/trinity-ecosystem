require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'GCM'], { stdio: 'inherit', shell: true });
