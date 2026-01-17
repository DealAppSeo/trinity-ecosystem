"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseMCP = void 0;
const BaseMCP_1 = require("./BaseMCP");
const supabase_1 = require("../../supabase");
class SupabaseMCP extends BaseMCP_1.BaseMCP {
    constructor() {
        super('Supabase');
    }
    async connect() {
        // Supabase client is global, just verify connection if possible
        // No-op for now as Supabase client is initialized on import
    }
    async getTools() {
        return [
            {
                name: 'read_table',
                description: 'Read rows from a specified database table (e.g. trinity_bids, trinity_logs)',
                schema: {
                    type: 'object',
                    properties: {
                        table_name: { type: 'string' },
                        limit: { type: 'number', default: 10 },
                        order_by: { type: 'string', default: 'created_at' }
                    },
                    required: ['table_name']
                },
                execute: async (args) => this.callTool('read_table', args)
            },
            {
                name: 'write_record',
                description: 'Insert a record into a table (Use only for logs/reports)',
                schema: {
                    type: 'object',
                    properties: {
                        table_name: { type: 'string' },
                        data: { type: 'object' }
                    },
                    required: ['table_name', 'data']
                },
                execute: async (args) => this.callTool('write_record', args)
            }
        ];
    }
    async callTool(toolName, args) {
        if (toolName === 'read_table') {
            const { table_name, limit = 10, order_by = 'created_at' } = args;
            const { data, error } = await supabase_1.supabase
                .from(table_name)
                .select('*')
                .order(order_by, { ascending: false })
                .limit(limit);
            if (error)
                throw new Error(error.message);
            return JSON.stringify(data, null, 2);
        }
        if (toolName === 'write_record') {
            const { table_name, data: payload } = args;
            const { data, error } = await supabase_1.supabase
                .from(table_name)
                .insert(payload)
                .select();
            if (error)
                throw new Error(error.message);
            return JSON.stringify({ success: true, count: data?.length });
        }
        throw new Error(`Tool ${toolName} not supported.`);
    }
}
exports.SupabaseMCP = SupabaseMCP;
