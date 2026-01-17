"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in environment.');
    process.exit(1);
}
async function applySchema() {
    const client = new pg_1.Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        console.log('✅ Connected to Database.');
        const sqlPath = path_1.default.join(process.cwd(), 'sql', '05_bidder_schema.sql');
        const sql = fs_1.default.readFileSync(sqlPath, 'utf8');
        console.log('📜 Applying Schema from 05_bidder_schema.sql...');
        await client.query(sql);
        console.log('✅ Schema Applied Successfully.');
    }
    catch (err) {
        console.error('❌ Schema Application Failed:', err.message);
    }
    finally {
        await client.end();
    }
}
applySchema();
