require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'MEL'], { stdio: 'inherit', shell: true });
