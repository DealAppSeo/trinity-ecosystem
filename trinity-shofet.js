require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'trinity-shofet'], { stdio: 'inherit', shell: true });
