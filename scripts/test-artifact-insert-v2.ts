import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function test() {
    const { error } = await supabase.from('trinity_artifacts').insert({
        task_id: 'test',
        title: 'test',
        content_preview: 'test content'
    });

    if (error) {
        console.log('Insert Error:', error.message);
    } else {
        console.log('Insert Success with content_preview!');
    }
}

test();
