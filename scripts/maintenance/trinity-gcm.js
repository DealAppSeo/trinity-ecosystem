require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'GCM'], { stdio: 'inherit', shell: true });
