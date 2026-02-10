
import { Task } from './types';
import { CONSTITUTION } from './wisdom';

export enum SwarmState {
    RESEARCH = 'research',
    DESIGN = 'design',
    IMPLEMENTATION = 'implementation',
    QUALITY_ASSURANCE = 'qa',
    GOVERNANCE = 'governance'
}

export interface SwarmHandoff {
    nextAgent: string;
    nextState: SwarmState;
    instruction: string;
}

export class SwarmOrchestrator {
    private static AGENT_MAP: Record<string, string[]> = {
        [SwarmState.RESEARCH]: ['trinity-veritas', 'trinity-torch', 'trinity-sophia'],
        [SwarmState.DESIGN]: ['trinity-mel', 'trinity-seraph'],
        [SwarmState.IMPLEMENTATION]: ['trinity-axis', 'trinity-veritas', 'trinity-nexus'], // Axis for code, Veritas for security, Nexus for network
        [SwarmState.QUALITY_ASSURANCE]: ['trinity-torch', 'trinity-mel'],
        [SwarmState.GOVERNANCE]: ['trinity-veritas', 'trinity-seraph', 'trinity-chesed']
    };

    /**
     * Determines the next step in a complex workflow using LangGraph-style state transitions.
     */
    static planNextStep(task: Task, currentResult: string, evaluation: any): SwarmHandoff | null {
        try {
            const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : (task.metadata || {});
            const currentState = meta.swarm_state || this.inferStateFromTask(task);

            let handoff: SwarmHandoff | null = null;

            // Logic for transitions
            if (currentState === SwarmState.RESEARCH && evaluation.score > 70) {
                handoff = {
                    nextAgent: 'trinity-mel', // Handoff to Design
                    nextState: SwarmState.DESIGN,
                    instruction: `Research completed. Please create a UI/UX design or artifact based on these findings: ${currentResult.substring(0, 500)}`
                };
            } else if (currentState === SwarmState.DESIGN && evaluation.score > 70) {
                handoff = {
                    nextAgent: 'trinity-axis', // Handoff to Implementation
                    nextState: SwarmState.IMPLEMENTATION,
                    instruction: `Design finalized. Please implement the following specifications: ${currentResult.substring(0, 500)}`
                };
            } else if (currentState === SwarmState.IMPLEMENTATION && evaluation.score > 70) {
                handoff = {
                    nextAgent: 'trinity-torch', // Handoff to QA
                    nextState: SwarmState.QUALITY_ASSURANCE,
                    instruction: `Implementation ready for audit. Please verify the code and logic: ${currentResult.substring(0, 500)}`
                };
            }

            // [ANTIGRAVITY] Self-Healing: If evaluation is low, loop back to previous state or escalate
            if (evaluation.score < 40) {
                return {
                    nextAgent: meta.prev_agent || 'trinity-veritas',
                    nextState: currentState, // Retry current state
                    instruction: `Your previous work was flagged with low confidence (${evaluation.score}). Please refine or escalate. Critique: ${evaluation.critique || 'Unknown error'}`
                };
            }

            // [PHASE 8] Constitutional Handshake & A2A Bridge
            // The previous `const handoff` declaration was removed to ensure the `handoff` variable is consistently used.

            // Final check: Every outgoing handoff must pass the constitutional audit
            if (handoff) {
                const alignment = this.verifyConstitutionalAlignment(handoff.instruction);
                if (!alignment.passed) {
                    console.error(`[CONSTITUTIONAL HANDSHAKE] 🛑 VIOLATION: ${alignment.reason}`);
                    return {
                        nextAgent: 'trinity-gcm', // Escalate to Constitutional Guardian
                        nextState: SwarmState.GOVERNANCE,
                        instruction: `Handoff BLOCKED by Constitutional Handshake. Reason: ${alignment.reason}. PLEASE LOG THIS TO GOVERNANCE LEDGER.`
                    };
                }
            }

            return handoff; // No handoff required (terminal state)
        } catch (e) {
            console.error('[ORCHESTRATOR] ❌ Error planning next step:', e);
            return null;
        }
    }

    /**
     * [RESOURCEFUL] Screen instructions against Phil. 4:8 Virtues.
     */
    static verifyConstitutionalAlignment(instruction: string): { passed: boolean; reason?: string } {
        const text = instruction.toLowerCase();

        if (text.includes('fabricate') || text.includes('lie') || text.includes('hallucinate')) {
            return { passed: false, reason: 'Violation of VIRTUE.TRUE (Never fabricate).' };
        }
        if (text.includes('hide') || text.includes('obfuscate')) {
            return { passed: false, reason: 'Violation of VIRTUE.PURE (Log everything).' };
        }

        // A2A Protocol Enforcement
        if (text.includes('external-swarm') && !text.includes('a2a')) {
            return { passed: false, reason: 'External communication must use A2A Protocol (ARTICLE_A2A).' };
        }

        return { passed: true };
    }

    private static inferStateFromTask(task: Task): SwarmState {
        const text = `${task.title} ${task.description}`.toLowerCase();
        if (text.includes('research') || text.includes('analyze') || text.includes('audit')) return SwarmState.RESEARCH;
        if (text.includes('design') || text.includes('ui') || text.includes('frontend')) return SwarmState.DESIGN;
        if (text.includes('implement') || text.includes('code') || text.includes('build')) return SwarmState.IMPLEMENTATION;
        if (text.includes('verify') || text.includes('test') || text.includes('qa')) return SwarmState.QUALITY_ASSURANCE;
        return SwarmState.RESEARCH; // Default entry
    }
}
