require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'HDM'], { stdio: 'inherit', shell: true });
