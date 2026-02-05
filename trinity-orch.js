require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'trinity-orch'], { stdio: 'inherit', shell: true });
