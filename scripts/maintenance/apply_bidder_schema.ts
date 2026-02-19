import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in environment.');
    process.exit(1);
}

async function applySchema() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to Database.');

        const sqlPath = path.join(process.cwd(), 'sql', '05_bidder_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📜 Applying Schema from 05_bidder_schema.sql...');
        await client.query(sql);
        console.log('✅ Schema Applied Successfully.');

    } catch (err: any) {
        console.error('❌ Schema Application Failed:', err.message);
    } finally {
        await client.end();
    }
}

applySchema();
