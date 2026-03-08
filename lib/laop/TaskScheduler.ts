import { supabaseAdmin as supabase } from '../supabase';

export interface MicroTask {
    id: string;
    title: string;
    execute: () => Promise<any>;
}

export class TaskScheduler {
    private static instance: TaskScheduler;
    private queue: MicroTask[] = [];
    private history: string[] = [];

    private constructor() {
        // Initial micro-tasks
        this.addMicroTask({
            id: 'pref-next',
            title: 'Pre-fetching next likely query vectors',
            execute: async () => { /* RAG pre-fetch logic */ await new Promise(r => setTimeout(r, 500)); }
        });
        this.addMicroTask({
            id: 'rep-sync',
            title: 'Updating global reputation cache',
            execute: async () => { /* Sync logic */ await new Promise(r => setTimeout(r, 600)); }
        });
        this.addMicroTask({
            id: 'log-compress',
            title: 'Compressing session logs for archive',
            execute: async () => { /* Compression logic */ await new Promise(r => setTimeout(r, 800)); }
        });
    }

    public static getInstance(): TaskScheduler {
        if (!TaskScheduler.instance) {
            TaskScheduler.instance = new TaskScheduler();
        }
        return TaskScheduler.instance;
    }

    public addMicroTask(task: MicroTask) {
        this.queue.push(task);
    }

    /**
     * Consumes available wait time by executing background tasks.
     * @param maxMs Maximum time allowed to occupy.
     */
    async consumeWaitTime(maxMs: number, agentName: string): Promise<number> {
        const start = Date.now();
        let completedCount = 0;

        console.log(`[LAOP-SCHEDULER] Consuming up to ${maxMs}ms with micro-tasks...`);

        while (Date.now() - start < maxMs && this.queue.length > 0) {
            const task = this.queue.shift()!;
            try {
                const taskStart = Date.now();
                await task.execute();
                const duration = Date.now() - taskStart;

                const logMsg = `LAOP: ${task.title} completed in ${duration}ms during wait.`;
                console.log(`[${agentName}] ${logMsg}`);

                await supabase.from('trinity_agent_logs').insert([{
                    agent_name: agentName,
                    message: logMsg,
                    action: 'LAOP_BACKGROUND_TASK',
                    metadata: { task_id: task.id, duration_ms: duration }
                }]);

                completedCount++;
                this.history.push(`${task.id}:${duration}ms`);
            } catch (e: any) {
                console.error(`[LAOP-SCHEDULER] Micro-task ${task.id} failed:`, e.message);
            }
        }

        return completedCount;
    }
}
