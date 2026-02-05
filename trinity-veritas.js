require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'VERITAS'], { stdio: 'inherit', shell: true });
