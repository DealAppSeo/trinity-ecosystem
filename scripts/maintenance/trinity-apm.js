require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'APM'], { stdio: 'inherit', shell: true });
