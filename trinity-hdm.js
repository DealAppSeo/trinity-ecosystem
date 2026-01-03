require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'HDM'], { stdio: 'inherit', shell: true });
