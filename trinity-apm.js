require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'APM'], { stdio: 'inherit', shell: true });
