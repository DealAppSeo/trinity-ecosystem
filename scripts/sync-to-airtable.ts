
dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/hyperdag-sandbox/.env.local' });

console.log('🔑 Checking credentials...');
console.log('  Supabase URL:', (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ? '✅ Loaded' : '❌ Missing');
console.log('  Airtable Key:', process.env.AIRTABLE_API_KEY ? `✅ Loaded (${process.env.AIRTABLE_API_KEY.substring(0, 5)}...)` : '❌ Missing');
console.log('  Airtable Base:', process.env.AIRTABLE_BASE_ID ? '✅ Loaded' : '❌ Missing');

const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!process.env.AIRTABLE_API_KEY) {
    throw new Error('AIRTABLE_API_KEY is required but missing from process.env');
}

if (!supaUrl) {
    throw new Error('SUPABASE_URL is missing from process.env');
}

const supabase = createClient(
    supaUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const airtable = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY });
const base = airtable.base(process.env.AIRTABLE_BASE_ID!);

async function syncTasks() {
    console.log('🔄 Mirroring Supabase Tasks to Airtable...');

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10); // Syncing latest 10 for demonstration

    if (error) {
        console.error('❌ Supabase Fetch Error:', error.message);
        return;
    }

    for (const task of tasks) {
        try {
            await base('Strategic Backlog').create([
                {
                    fields: {
                        'Task Name': task.title,
                        'Status': task.status,
                        'Priority': task.priority?.toString() || '0',
                        'Assigned Squad': task.assigned_to || 'Unassigned',
                        'Agent Notes': task.result || task.description
                    }
                }
            ]);
            console.log(`✅ Synced: ${task.title}`);
        } catch (e: any) {
            console.warn(`⚠️ Could not sync task "${task.title}": ${e.message}. (Table name or fields might not match yet)`);
        }
    }
}

async function syncArtifacts() {
    console.log('🖼️ Mirroring Artifacts to Airtable Gallery...');

    const { data: artifacts, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('❌ Supabase Artifact Fetch Error:', error.message);
        return;
    }

    for (const art of artifacts) {
        try {
            await base('Artifact Gallery').create([
                {
                    fields: {
                        'Name': art.name,
                        'URL': art.url || '',
                        'Type': art.type,
                        'Squad': art.generated_by || 'Unknown',
                        'Created At': art.created_at
                    }
                }
            ]);
            console.log(`✅ Synced Artifact: ${art.name}`);
        } catch (e: any) {
            console.warn(`⚠️ Could not sync artifact "${art.name}": ${e.message}`);
        }
    }
}

async function runSync() {
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        console.error('❌ Missing Airtable Credentials. Please set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env.local');
        return;
    }

    await syncTasks();
    await syncArtifacts();
    console.log('🏁 Sync Process Complete.');
}

runSync();
