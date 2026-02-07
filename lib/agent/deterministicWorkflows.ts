
export interface WorkflowStep {
    id: string;
    instruction: string;
    tool_suggestions?: string[];
}

export interface DeterministicWorkflow {
    agent_name: string;
    task_pattern: string; // Regex or substring
    steps: WorkflowStep[];
}

export const DETERMINISTIC_WORKFLOWS: DeterministicWorkflow[] = [
    {
        agent_name: 'trinity-mel',
        task_pattern: '[UI-AUDIT]',
        steps: [
            {
                id: '1',
                instruction: 'List all files in the components directory to understand the project structure.',
                tool_suggestions: ['list_dir']
            },
            {
                id: '2',
                instruction: 'Read the contents of NavBar.tsx and SymphonyCard.tsx to check for consistency.',
                tool_suggestions: ['view_file']
            },
            {
                id: '3',
                instruction: 'Generate a report artifact summarizing UI inconsistencies and suggested fixes.',
                tool_suggestions: ['save_artifact']
            }
        ]
    },
    {
        agent_name: 'trinity-veritas',
        task_pattern: '[SECURITY-CHECK]',
        steps: [
            {
                id: '1',
                instruction: 'Check the supabase_rls_audit artifact for any open vulnerabilities.',
                tool_suggestions: ['view_file']
            },
            {
                id: '2',
                instruction: 'Verify that all public tables have RLS enabled by checking the database schema.',
                tool_suggestions: ['list_railway_services'] // Or direct SQL if available
            },
            {
                id: '3',
                instruction: 'Finalize the verification with a status update on the mission board.',
                tool_suggestions: ['update_task']
            }
        ]
    }
];
