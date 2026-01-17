import { supabase } from '../lib/supabase';

async function verify() {
    console.log("🚀 Seeding Verification Task for MEL...");

    const { data, error } = await supabase.from('trinity_tasks').insert({
        title: "[VERIFY] Glassmorphism Design System",
        description: "Design a minimalist glassmorphism card component with frosted background and neon borders. Provide CSS and HTML structure.",
        task_type: "design",
        assigned_to: "trinity-mel",
        priority: 60,
        status: "pending"
    }).select();

    if (error) {
        console.error("❌ Failed to seed task:", error.message);
    } else {
        console.log("✅ Task seeded successfully:", data[0].id);
    }
}

verify();
