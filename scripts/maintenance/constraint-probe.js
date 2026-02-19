require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- DEFINITIVE COLUMN AUDIT ---');
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'trinity_artifacts' });

    if (error) {
        // RPC might not exist, use raw query on information_schema if possible (though limited in PostgREST)
        // Alternative: Try to select 1 row and print keys, or just use the error messages from inserts.
        console.log('RPC failed. Reverting to constraint-probing...');

        let fields = {};
        let done = false;
        while (!done) {
            const { error: insErr } = await supabase.from('trinity_artifacts').insert(fields).select();
            if (insErr && insErr.message.includes('not-null')) {
                const match = insErr.message.match(/column "(.+)" violates/);
                if (match) {
                    const col = match[1];
                    console.log(`Found Required Column: ${col}`);
                    fields[col] = 'placeholder';
                } else {
                    console.log('Unknown error:', insErr.message);
                    done = true;
                }
            } else if (insErr) {
                console.log('Stopped with non-null error:', insErr.message);
                done = true;
            } else {
                console.log('Success! Final fields used to bypass NOT NULL:', Object.keys(fields));
                done = true;
            }
        }
    } else {
        console.log('Columns:', data);
    }
}

run();
