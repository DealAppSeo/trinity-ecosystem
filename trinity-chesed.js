require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'trinity-chesed'], { stdio: 'inherit', shell: true });
