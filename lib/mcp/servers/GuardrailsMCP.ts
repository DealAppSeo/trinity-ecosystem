
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';
import { CONSTITUTION } from '../../agent/wisdom';

/**
 * [RESOURCEFUL] GuardrailsMCP
 * Inspired by OpenPaws. Mandatory ethical alignment and multi-app auditing.
 */
export class GuardrailsMCP extends BaseMCP {
    constructor() {
        super('Guardrails');
        this.setupTools();
    }

    async connect(): Promise<void> {
        this.isConnected = true;
    }

    private setupTools() {
        this.registerTool({
            name: 'verify_alignment',
            description: 'Checks a proposed action against the ecosystem Constitution.',
            schema: {
                type: 'object',
                properties: {
                    actionDescription: { type: 'string', description: 'What the agent intends to do' },
                    targetApp: { type: 'string', description: 'The tool or app being used (e.g., n8n, Railway, GitHub)' },
                    modelPrompt: { type: 'string', description: 'The specific prompt or payload being sent' }
                },
                required: ['actionDescription']
            },
            execute: async (args: any) => this.verifyAlignment(args)
        });

        this.registerTool({
            name: 'audit_automation_payload',
            description: 'Analyzes a JSON payload intended for an n8n or Airtable automation for risks.',
            schema: {
                type: 'object',
                properties: {
                    payload: { type: 'object', description: 'The raw JSON payload' },
                    destination: { type: 'string', description: 'Where the data is going' }
                },
                required: ['payload']
            },
            execute: async (args: any) => this.auditPayload(args)
        });

        this.registerTool({
            name: 'check_speciesist_bias',
            description: 'Mandatory OpenPaws check to ensure AI output is anti-speciesist and ethically balanced.',
            schema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The text to analyze' }
                },
                required: ['text']
            },
            execute: async (args: any) => this.checkBias(args.text)
        });
    }

    private async verifyAlignment(args: any): Promise<string> {
        console.log(`[Guardrails] 🛡️ Verifying alignment for: ${args.actionDescription} on ${args.targetApp || 'General'}`);

        // Patterns for rapid constitutional audit
        const violations = [];
        const text = (args.actionDescription + ' ' + (args.modelPrompt || '')).toLowerCase();

        if (text.includes('delete') && text.includes('all')) {
            violations.push('Potential violation of persistence (ARTICLE_0: Self-Examination required for destructive acts).');
        }
        if (text.includes('hide') || text.includes('obfuscate')) {
            violations.push('Violation of VIRTUE.PURE: Log everything. Hide nothing.');
        }
        if (text.includes('fabricate') || text.includes('lie')) {
            violations.push('Violation of VIRTUE.TRUE: Never fabricate.');
        }

        if (violations.length > 0) {
            return `[ALIGNMENT FAILED] 🔴\n\n${violations.join('\n')}\n\n[Directive]: Modification required. Proceeding without fix is unconstitutional.`;
        }

        return `[ALIGNMENT PASSED] 🟢\n\nAction aligns with Constitution v${CONSTITUTION.VERSION}.`;
    }

    private auditPayload(args: any): string {
        const payloadStr = JSON.stringify(args.payload).toLowerCase();

        // Risk detection for automations
        const risks = [];
        if (payloadStr.includes('api_key') || payloadStr.includes('password') || payloadStr.includes('token')) {
            risks.push('CRITICAL: Sensitive credentials detected in automation payload. Must use Secret masking.');
        }
        if (payloadStr.length > 10000) {
            risks.push('WARNING: Payload size exceeds efficiency guardrails (>10KB).');
        }

        if (risks.length > 0) {
            return `[AUDIT ALERT] ⚠️\n\n${risks.join('\n')}\n\n[Action]: Mitigation required before execution on ${args.destination || 'Automation Bridge'}.`;
        }

        return `[AUDIT CLEAN] ✅ No critical risks detected in payload for ${args.destination}.`;
    }

    private checkBias(text: string): string {
        // OpenPaws pattern: detect speciesist language or harmful bias
        const biasKeywords = ['inferior', 'pest', 'resource', 'object', 'livestock'];
        const matches = biasKeywords.filter(k => text.toLowerCase().includes(k));

        if (matches.length > 0) {
            return `[BIAS ALERT] 🐾 OpenPaws Monitor detected speciesist or objectifying language: ${matches.join(', ')}.\n\n[Recommendation]: Rephrase to reflect sentient equality as per Trinity Ethos.`;
        }

        return `[BIAS CHECK PASSED] ✨ Output adheres to OpenPaws ethical guidelines.`;
    }
}
