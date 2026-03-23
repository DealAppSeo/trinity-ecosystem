const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testWaitlist() {
    console.log("Starting Waitlist Logic Test...");
    const email = "seantest@aitrinitysymphony.com";
    const resendApiKey = process.env.RESEND_API_KEY;
    
    // 1. Directly insert into Supabase to verify schema and connection
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { error: dbError } = await supabase.from('waitlist').insert([{
        name: "Sean Test",
        email: email,
        github_username: "DealAppSeo",
        what_building: "Verification Agent",
        pain_points: JSON.stringify({ notes: "Hallucinations" }),
        source: 'test_script'
    }]);
    
    if (dbError) {
        console.error("❌ Supabase Insertion Failed:", dbError);
    } else {
        console.log("✅ Supabase row successfully inserted into 'waitlist' table.");
    }
    
    // 2. Direct fetch to Resend
    if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY is not available in local .env, skipping live email transmit test.");
        return;
    }
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: "hello@aitrinitysymphony.com",
            to: email,
            subject: "You are on the Trinity Symphony founding member list",
            text: "Thank you for joining the Trinity Symphony private beta. You are one of 100 founding members. We will reach out with early access details shortly. Help people help people — the last, the lost, and the least. Micah 6:8. The Trinity Symphony Team."
        })
    });
    
    if (emailResponse.ok) {
        console.log("✅ Resend transmission successful.");
    } else {
        const text = await emailResponse.text();
        console.error("❌ Resend API Error:", text);
    }
}
testWaitlist();
