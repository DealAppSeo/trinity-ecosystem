import { TaskRouter } from '../lib/scheduler/TaskRouter';

async function main() {
    console.log("🛠️ Starting Trinity Scheduler Pulse...");
    const router = new TaskRouter();

    // Run immediately on start
    await router.pollAndRoute();

    // Then poll every 5 minutes
    setInterval(async () => {
        try {
            await router.pollAndRoute();
        } catch (e: any) {
            console.error(`[SCHEDULER] Loop Error:`, e.message);
        }
    }, 5 * 60 * 1000);

    console.log("✅ Scheduler is active and polling every 5 minutes.");
}

// Keep process alive
process.on('uncaughtException', (err) => {
    console.error('Fatal Scheduler Exception:', err);
});

main().catch(console.error);
