"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../lib/supabase");
async function check() {
    console.log("🔍 Checking DB Counts (using lib/supabase)...");
    const { count: artifactCount, error: err1 } = await supabase_1.supabase.from('trinity_artifacts').select('*', { count: 'exact', head: true });
    if (err1)
        console.error("Artifact Error:", err1);
    else
        console.log(`✅ Total Artifacts: ${artifactCount}`);
    const { count: taskCount, error: err2 } = await supabase_1.supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    if (err2)
        console.error("Task Error:", err2);
    else
        console.log(`✅ Total Tasks: ${taskCount}`);
    console.log("-------------------");
    const { data: recent, error: err3 } = await supabase_1.supabase.from('trinity_artifacts').select('title, created_at, access_level').order('created_at', { ascending: false }).limit(3);
    if (recent) {
        console.log("Recent Artifacts:");
        recent.forEach(r => console.log(` - [${r.access_level}] ${r.title} (${r.created_at})`));
    }
}
check();
