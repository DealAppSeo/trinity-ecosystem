
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Hardcoded for reliability
const supabaseUrl = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    const taskId = crypto.randomUUID();
    console.log(`🔍 Verifying with valid UUID: ${taskId}`);

    // TEST 1: 'agent'
    console.log("\n--- TEST 1: 'agent' ---");
    const { error: err1 } = await supabase.from('trinity_artifacts').insert({
        task_id: taskId,
        agent: 'VERIFICATION_TEST',
        artifact_type: 'test',
        content_preview: 'Verification Probe'
    });

    if (!err1) {
        console.log("✅ SUCCESS: Column 'agent' exists and is writable.");
    } else {
        console.log("❌ FAILURE: 'agent' insert failed:", err1.message);
    }

    // TEST 2: 'agent_name'
    console.log("\n--- TEST 2: 'agent_name' ---");
    const taskId2 = crypto.randomUUID();
    const { error: err2 } = await supabase.from('trinity_artifacts').insert({
        task_id: taskId2,
        agent_name: 'VERIFICATION_TEST',
        artifact_type: 'test',
        content_preview: 'Verification Probe'
    });

    if (!err2) {
        console.log("✅ SUCCESS: Column 'agent_name' exists and is writable.");
    } else {
        console.log("❌ FAILURE: 'agent_name' insert failed:", err2.message);
    }
}

verify();
