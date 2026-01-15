require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'trinity-orch'], { stdio: 'inherit', shell: true });
