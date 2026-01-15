require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'trinity-shofet'], { stdio: 'inherit', shell: true });
