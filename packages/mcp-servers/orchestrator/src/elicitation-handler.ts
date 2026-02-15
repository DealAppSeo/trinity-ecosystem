/**
 * @title Ethical Elicitation Handler
 * @dev Manages user input requests filtered through the Constitutional Guard (Phil 4:8).
 */

export interface ElicitationOption {
    toolId: string;
    isEthical: boolean;
    reason?: string;
}

export class EthicalElicitationHandler {
    /**
     * Creates an elicitation request when routing confidence is low, 
     * ensuring all presented options are constitutional.
     */
    async createElicitation(
        query: string,
        options: ElicitationOption[]
    ): Promise<any> {
        const ethicalOptions = options.filter(o => o.isEthical);

        if (ethicalOptions.length === 0) {
            return {
                message: `I couldn't find ethical options for "${query}" based on the Trinity Constitution. Rephrase?`,
                canRetry: true
            };
        }

        return {
            message: `I found several approaches for "${query}". Which should I proceed with?`,
            options: ethicalOptions.map(o => o.toolId)
        };
    }
}
