import { exec } from 'child_process';

console.log('🔪 Hunting for zombie swarms...');

// Kill node processes running run-swarm.ts or trinity-worker.js
// using robust command for Windows (taskkill) since user is on Windows
const command = process.platform === 'win32'
    ? 'taskkill /F /IM node.exe /FI "WINDOWTITLE eq TrinitySwarm*"' // Broad kill might be risky, but user asked to kill duplicates. 
    // Safer to just kill by command line match if we could, but on Windows wmic is cleaner.
    // Let's stick to the user's provided pkill style but adapted for cross-platform or just rely on 'taskkill' for specifically known pids if possible.
    // Actually, simply killing all node processes might be too aggressive if they have other things open.
    // User suggested: exec('pkill -f "node trinity-worker.js" || pkill -f "tsx scripts/run-swarm.ts"...
    // On Windows, pkill is not standard.
    : 'pkill -f "run-swarm.ts" || pkill -f "trinity-worker.js"';

// For Windows specifically since we know OS is Windows:
const winCommand = `wmic process where "CommandLine like '%run-swarm.ts%' or CommandLine like '%trinity-worker.js%'" call terminate`;

if (process.platform === 'win32') {
    exec(winCommand, (error, stdout, stderr) => {
        if (error) console.warn(`⚠️  No specific swarm processes found or error: ${error.message}`);
        else console.log('💀 Swarm processes killed.');
    });
} else {
    exec(command, (error, stdout, stderr) => {
        if (error) console.error(`Error killing swarm: ${error}`);
        console.log('Swarm processes killed. Restart clean.');
    });
}
