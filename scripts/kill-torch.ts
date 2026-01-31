
import { execSync } from 'child_process';

function killTorch() {
    try {
        console.log('Searching for trinity-torch process...');
        const output = execSync('wmic process where "commandline like \'%run-agent.ts trinity-torch%\'" get processid').toString();
        const pids = output.split('\n').map(line => line.trim()).filter(line => line && !isNaN(Number(line)));

        if (pids.length === 0) {
            console.log('No trinity-torch process found.');
            return;
        }

        pids.forEach(pid => {
            console.log(`Terminating process ${pid}...`);
            try {
                execSync(`taskkill /F /PID ${pid}`);
                console.log(`Process ${pid} terminated.`);
            } catch (e) {
                console.error(`Failed to terminate ${pid}: ${e.message}`);
            }
        });
    } catch (e) {
        console.error('Error finding process:', e.message);
    }
}

killTorch();
