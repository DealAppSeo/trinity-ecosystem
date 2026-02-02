
import { MCPServer, MCPTool } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export class SandboxMCP implements MCPServer {
    name = 'ActionSandbox';
    private sandboxDir: string;

    constructor() {
        this.sandboxDir = path.resolve(process.cwd(), 'temp_sandbox');
        if (!fs.existsSync(this.sandboxDir)) {
            fs.mkdirSync(this.sandboxDir, { recursive: true });
        }
    }

    async initialize(): Promise<void> {
        console.log(`[SandboxMCP] Action Sandbox ready at ${this.sandboxDir}`);
    }

    async healthCheck(): Promise<boolean> {
        return fs.existsSync(this.sandboxDir);
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'run_in_sandbox',
                description: 'Execute a command in a restricted temporary directory. Use this to test code, run linters, or build assets.',
                schema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'The shell command to run.' },
                        files: {
                            type: 'object',
                            description: 'Optional files to seed the sandbox with (filename -> content).'
                        },
                        timeout: { type: 'number', description: 'Execution timeout in ms (default 5000).' }
                    },
                    required: ['command']
                },
                execute: async (args: any) => this.runCommand(args.command, args.files, args.timeout)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<any> {
        if (toolName === 'run_in_sandbox') return this.runCommand(args.command, args.files, args.timeout);
        throw new Error(`Tool ${toolName} not found in SandboxMCP`);
    }

    private async runCommand(command: string, files?: Record<string, string>, timeout: number = 5000): Promise<string> {
        // [GUARDRAIL] INITIAL SECURITY FILTER (Pattern matching)
        const DENY_LIST = [/rm -rf/, /chmod/, /chown/, /> \/dev/, /kill/, /iptables/];
        if (DENY_LIST.some(p => p.test(command))) {
            return "ERROR: Command violates GuardRail safety policies (Restricted command detected).";
        }

        const runId = Math.random().toString(36).substring(7);
        const taskDir = path.join(this.sandboxDir, runId);
        fs.mkdirSync(taskDir, { recursive: true });

        try {
            // Seed files
            if (files) {
                for (const [filename, content] of Object.entries(files)) {
                    fs.writeFileSync(path.join(taskDir, filename), content);
                }
            }

            console.log(`[Sandbox] 🏃 Running: "${command}" in ${runId}`);

            // For MVP: Light execution with timeout. 
            // Phase 2 will use gVisor or Firecracker.
            const { stdout, stderr } = await execAsync(command, {
                cwd: taskDir,
                timeout: timeout,
                maxBuffer: 1024 * 1024 // 1MB
            });

            return JSON.stringify({
                stdout,
                stderr,
                exitCode: 0,
                status: 'success'
            });
        } catch (e: any) {
            return JSON.stringify({
                stdout: e.stdout || '',
                stderr: e.stderr || e.message,
                exitCode: e.code || 1,
                status: 'error'
            });
        } finally {
            // Cleanup: Optional, maybe keep for audit but we'll clean up for now
            // fs.rmSync(taskDir, { recursive: true, force: true });
        }
    }
}
