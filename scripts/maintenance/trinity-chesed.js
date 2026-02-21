require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'trinity-chesed'], { stdio: 'inherit', shell: true });
