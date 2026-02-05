require('child_process').spawn('npx', ['tsx', 'scripts/run-agent.ts', 'TORCH'], { stdio: 'inherit', shell: true });
