require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'W3C'], { stdio: 'inherit', shell: true });
