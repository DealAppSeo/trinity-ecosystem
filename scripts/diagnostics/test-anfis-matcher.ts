import axios from 'axios';

async function testMatcher() {
    console.log("🧪 Testing ANFIS Co-Founder Matcher...");
    const url = 'http://127.0.0.1:8000/anfis/v2/match'; 

    const testCases = [
        {
            name: "Perfect Complement (Complementary skills + high value alignment)",
            input: {
                user_id: "sean_admin",
                target_id: "crypto_dev_1",
                skills_s: 0.2, // Low similarity = high gap (complementary)
                values_a: 0.9, // High value alignment
                domain_o: 0.6  // Moderate domain overlap
            }
        },
        {
            name: "Clash (High skills but no value alignment)",
            input: {
                user_id: "sean_admin",
                target_id: "mercenary_dev",
                skills_s: 0.1, 
                values_a: 0.1, // LOW value alignment
                domain_o: 0.8  
            }
        },
        {
            name: "Redundant (High value alignment but same skills)",
            input: {
                user_id: "sean_admin",
                target_id: "cloned_mind",
                skills_s: 0.9, // High similarity = same skills
                values_a: 0.9,
                domain_o: 0.9
            }
        }
    ];

    for (const test of testCases) {
        console.log(`\n▶️ Test: ${test.name}`);
        try {
            const response = await axios.post(url, test.input);
            console.log(`✅ Result: ${response.data.recommendation} (Score: ${response.data.match_score.toFixed(1)})`);
            console.log(`🧠 Reasoning: ${response.data.reasoning.join(', ')}`);
        } catch (e: any) {
            console.error(`❌ Failed: ${e.response?.data?.detail || e.message || e}`);
        }
    }
}

testMatcher();
