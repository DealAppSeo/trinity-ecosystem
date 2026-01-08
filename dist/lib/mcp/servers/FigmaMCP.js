"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FigmaMCP = void 0;
const BaseMCP_1 = require("./BaseMCP");
class FigmaMCP extends BaseMCP_1.BaseMCP {
    constructor() {
        super('Figma');
        this.baseUrl = 'https://api.figma.com/v1';
        this.accessToken = process.env.FIGMA_ACCESS_TOKEN || '';
    }
    async connect() {
        if (!this.accessToken) {
            // Soft fail: Warn but don't crash, just don't register tools? 
            // Or throw error if this MCP is critical. Keeping strict for now.
            throw new Error('FIGMA_ACCESS_TOKEN is missing');
        }
        this.registerTool({
            name: 'get_file_info',
            description: 'Get metadata about a Figma file',
            schema: {
                type: 'object',
                properties: {
                    file_key: { type: 'string', description: 'The file key from the Figma URL' }
                },
                required: ['file_key']
            },
            execute: this.getFileInfo.bind(this)
        });
        this.registerTool({
            name: 'get_comments',
            description: 'Get comments from a Figma file',
            schema: {
                type: 'object',
                properties: {
                    file_key: { type: 'string' }
                },
                required: ['file_key']
            },
            execute: this.getComments.bind(this)
        });
    }
    async getFileInfo(args) {
        const res = await fetch(`${this.baseUrl}/files/${args.file_key}`, {
            headers: { 'X-Figma-Token': this.accessToken }
        });
        if (!res.ok)
            throw new Error(`Figma API Error: ${res.statusText}`);
        const data = await res.json();
        return JSON.stringify({ name: data.name, lastModified: data.lastModified, thumbnailUrl: data.thumbnailUrl }, null, 2);
    }
    async getComments(args) {
        const res = await fetch(`${this.baseUrl}/files/${args.file_key}/comments`, {
            headers: { 'X-Figma-Token': this.accessToken }
        });
        if (!res.ok)
            throw new Error(`Figma API Error: ${res.statusText}`);
        const data = await res.json();
        return JSON.stringify(data.comments.slice(0, 5), null, 2); // Limit to 5
    }
}
exports.FigmaMCP = FigmaMCP;
