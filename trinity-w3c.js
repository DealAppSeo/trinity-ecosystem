require('child_process').spawn('npx', ['ts-node', 'scripts/run-agent.ts', 'W3C'], { stdio: 'inherit', shell: true });
