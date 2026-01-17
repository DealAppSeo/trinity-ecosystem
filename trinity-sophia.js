require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'trinity-sophia'], { stdio: 'inherit', shell: true });
