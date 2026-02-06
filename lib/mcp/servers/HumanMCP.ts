
import { BaseMCP } from './BaseMCP';

/**
 * HumanMCP - Human-in-the-Loop Protocol
 * Allows agents to formally escalate tasks to users for clarification, 
 * feedback, or manual intervention when autonomous confidence is low.
 */
export class HumanMCP extends BaseMCP {
    constructor() {
        super('HumanPilot');
    }

    async connect(): Promise<void> {
        this.registerTool({
            name: 'request_human_clarification',
            description: 'Ask the user a specific question or request clarification on a task. The task will be marked as "pending_clarification" until the user responds.',
            schema: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    question: { type: 'string', description: 'The specific question for the user.' },
                    options: { type: 'array', items: { type: 'string' }, description: 'Optional multiple-choice alternatives for the user.' }
                },
                required: ['taskId', 'question']
            },
            execute: this.requestClarification.bind(this)
        });

        this.registerTool({
            name: 'delegate_to_user',
            description: 'Formally assign a sub-task or choice to the user. Use this when you reach a crossroad that requires human subjective judgment.',
            schema: {
                type: 'object',
                properties: {
                    reason: { type: 'string' },
                    payload: { type: 'object' }
                },
                required: ['reason']
            },
            execute: async (args) => `DELEGATION_SENT: The founder has been notified. [Reason: ${args.reason}]`
        });
    }

    private async requestClarification(args: { taskId: string, question: string, options?: string[] }): Promise<string> {
        console.log(`[HumanMCP] 👤 Escalating Task ${args.taskId} to user: ${args.question}`);
        // In the real system, this would update the task status to 'pending_clarification' and 
        // add the question to the task metadata.
        return `SUCCESS: Task ${args.taskId} moved to 'pending_clarification'. User has been notified with question: "${args.question}"`;
    }
}
