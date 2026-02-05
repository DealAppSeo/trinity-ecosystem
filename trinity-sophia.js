require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'trinity-sophia'], { stdio: 'inherit', shell: true });
