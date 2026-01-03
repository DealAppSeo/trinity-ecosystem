require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'MEL'], { stdio: 'inherit', shell: true });
