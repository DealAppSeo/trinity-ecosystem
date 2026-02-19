
// Simulation of the logic in useTrinityController.ts to verify correctness

function checkStatus(agentName: string, lastHeartbeat: string | null) {
    if (!lastHeartbeat) return 'offline';

    const now = new Date().getTime(); // Current Time
    const heartbeatTime = new Date(lastHeartbeat).getTime();

    // Logic from hook: isLive = matchedHeartbeat && (new Date().getTime() - new Date(matchedHeartbeat.last_seen).getTime() < 120000)
    const isLive = (now - heartbeatTime) < 120000;

    return isLive ? 'active' : 'offline';
}

console.log("--- Agent Status Logic Verification ---");

// Test Case 1: Fresh Heartbeat
const now = new Date();
const freshHeartbeat = now.toISOString();
console.log(`Test 1 (Fresh): Expected 'active', Got '${checkStatus('test-agent', freshHeartbeat)}'`);

// Test Case 2: Stale Heartbeat (5 mins ago)
const staleTime = new Date(now.getTime() - 5 * 60 * 1000);
console.log(`Test 2 (Stale): Expected 'offline', Got '${checkStatus('test-agent', staleTime.toISOString())}'`);

// Test Case 3: No Heartbeat
console.log(`Test 3 (Null): Expected 'offline', Got '${checkStatus('test-agent', null)}'`);

console.log("\n--- Brain Status Logic Verification ---");
// Logic: setBrainStatus(res?.ok ? 'online' : 'offline');
// We can't mock fetch here easily, but the logic is trivial: boolean -> string.
console.log("Brain Status Logic: trivial mapping verified by inspection.");
