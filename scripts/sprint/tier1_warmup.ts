import { supabaseAdmin } from '../../lib/supabase';
import { getLLM } from './llm_factory';

async function runNexus() {
    console.log("[NEXUS] Starting Market Signal Gather...");
    const llm = getLLM('cerebras'); 
    const assets = ['bitcoin', 'ethereum', 'solana', 'base'];
    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assets.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
        const res = await fetch(url);
        if(!res.ok) throw new Error("CoinGecko API failed");
        const data = await res.json();

        for (const asset of assets) {
            if(!data[asset]) continue;
            const price = data[asset].usd;
            const change24h = data[asset].usd_24h_change;
            const vol = data[asset].usd_24h_vol;

            const prompt = `Act as an expert crypto analyst (NEXUS). Given: ${asset} price=$${price}, 24h_change=${change24h}%, 24h_vol=${vol}. Analyze sentiment (BULLISH/BEARISH/NEUTRAL) and output raw JSON exactly like: {"sentiment": "BULLISH", "confidence": 0.95}`;
            
            const aiRes = await llm.invoke(prompt);
            const content = aiRes.content.toString();
            let sentiment = "NEUTRAL", conf = 0.50;
            try {
                // Extract json
                const match = content.match(/\{.*\}/s);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    sentiment = parsed.sentiment;
                    conf = parsed.confidence;
                }
            } catch(e) { console.log("JSON parse fail fallback"); }

            let flag = "";
            if (conf < 0.80) flag = " [UNCERTAIN]";

            const logEntry = {
                agent_id: "NEXUS",
                task_type: "MARKET_SIGNAL",
                domain: "research",
                output_summary: `[${asset.toUpperCase()}] Price: $${price} | 24h: ${change24h}% | Vol: ${vol}. Sentiment: ${sentiment}${flag}`,
                u_score: 1.0 - conf,
                status: "done",
                metadata: { source: "CoinGecko", confidence: conf, flagged: conf < 0.80 },
                created_at: new Date().toISOString()
            };

            await supabaseAdmin.from('trinity_agent_logs').insert(logEntry);
            console.log(`[NEXUS] Logged ${asset.toUpperCase()}: ${sentiment} (${conf})`);
        }
    } catch(e: any) {
        console.error("[NEXUS] Failure:", e.message);
    }
}

async function runTorch() {
    console.log("[TORCH] Drafting LinkedIn Content...");
    const llm = getLLM('deepseek', 0.6);
    const hash = '0x92be19f78a23bdd93cfa2fa8bb5a64de937915cd1f3bf9b9276e6294f8a8b978';
    const angles = [
        { name: "Technical", description: "for developers, focused on the viem integration, bypassing APIs, and immutable trust" },
        { name: "Business", description: "for investors and enterprises, focused on the cost savings, AI accountability, and efficiency" },
        { name: "Mission", description: "Micah 6:8 angle, doing justly and loving mercy, for Sean's network, ensuring AI behaves with honor" }
    ];

    for (const angle of angles) {
        const prompt = `Act as TORCH, an AI copywriter. Write a LinkedIn post announcing our ERC-8004 hackathon submission. Angle: ${angle.description}. Max 150 words. MUST include the verified transaction hash exactly: ${hash}. Don't use markdown or quotes block, just plain text ready to post.`;
        
        const aiRes = await llm.invoke(prompt);
        await supabaseAdmin.from('linkedin_content_queue').insert({
            type: `Hackathon_Announcement_${angle.name}`,
            content: aiRes.content.toString(),
            status: 'PENDING_SEAN_REVIEW'
        });
        console.log(`[TORCH] Drafted ${angle.name} version`);
    }
}

async function runGCM() {
    console.log("[GCM] Scraping Developer Leads...");
    const llm = getLLM('perplexity');
    // Using Perplexity to find actual real-time results rather than just github api Mocking
    try {
        const prompt = `Find 5 developers currently building with LangChain or AutoGPT. Provide their github handles. Output ONLY a comma separated list of valid handles.`;
        const aiRes = await llm.invoke(prompt);
        const handles = aiRes.content.toString().split(',').map(h => h.trim());
        
        for (const handle of handles) {
            if(!handle) continue;
            await supabaseAdmin.from('linkedin_content_queue').insert({
                type: 'GCM_Outreach_Lead',
                content: `Developer Lead: ${handle}`,
                status: 'PENDING',
                metadata: { handle: handle, platform: 'Perplexity_Sourced', outrach_status: 'PENDING' }
            });
        }
        console.log(`[GCM] Mined ${handles.length} leads via Perplexity`);
    } catch(e: any) {
        console.error("[GCM] Failure:", e.message);
    }
}

async function tier1Warmup() {
    console.log("=== STARTING TIER 1 WARMUP ===");
    await runNexus();
    await runTorch();
    await runGCM();
    console.log("=== TIER 1 COMPLETE ===");
}

tier1Warmup();
