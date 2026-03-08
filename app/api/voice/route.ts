import { NextRequest, NextResponse } from 'next/server';

/**
 * TRINITY VOICE PIPELINE (STT -> Intent -> TTS)
 * This is a scaffold for the hackathon voice demo.
 */
export async function POST(req: NextRequest) {
    console.log('[VOICE] Incoming request to Trinity Voice Pipeline');

    try {
        let transcript = '';
        let isAudio = false;

        // Support both FormData (Audio) and JSON (Text/Mock)
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const audioFile = formData.get('audio');
            const textInput = formData.get('text');

            if (audioFile) {
                console.log('[VOICE] Step 1: Transcribing audio via Whisper...');
                const WHISPER_API_KEY = process.env.OPENAI_API_KEY;
                if (!WHISPER_API_KEY) throw new Error('OPENAI_API_KEY missing');

                const transcriptReq = new FormData();
                transcriptReq.append('file', audioFile);
                transcriptReq.append('model', 'whisper-1');

                const sttResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${WHISPER_API_KEY}` },
                    body: transcriptReq
                });
                const sttData = await sttResponse.json();
                transcript = sttData.text || "";
                isAudio = true;
            } else if (textInput) {
                transcript = textInput.toString();
            }
        } else if (contentType.includes('application/json')) {
            const body = await req.json();
            transcript = body.text || body.transcript || '';
        }

        if (!transcript) {
            return NextResponse.json({ error: 'No audio or text provided' }, { status: 400 });
        }

        // 2. Intent Parsing / Agent Response
        console.log(`[VOICE] Step 2: Parsing intent: "${transcript}"`);
        const lower = transcript.toLowerCase();

        // [LAOP] LATENCY AS OPPORTUNITY - ENTER ENGAGEMENT LOOP
        const laop = new EngagementEngine('ORCH');
        const { shouldEngage, estimatedLatency } = await laop.evaluate(transcript);

        if (shouldEngage && !isAudio) {
            console.log(`[LAOP] 💡 High Latency Detected (${estimatedLatency}ms). Engaging user...`);
            const question = await laop.generateQualifyingQuestion(transcript, {
                currentTask: 'Market Analysis',
                background: 'Trinity Symphony Developer'
            });

            // Log the initiation of background work
            const { supabaseAdmin } = await import('@/lib/supabase'); // Ensure supabaseAdmin is imported here if not already
            await supabaseAdmin.from('trinity_agent_logs').insert([{
                agent_name: 'ORCH',
                message: `⚡ LAOP ACTIVATED: Engaging user via qualifying question. Background processing started for: "${transcript}"`,
                action: 'LAOP_ENGAGE',
                metadata: { estimated_latency: estimatedLatency }
            }]);

            // Return the question IMMEDIATELY for the UI to show
            return NextResponse.json({
                transcript,
                agentResponse: question,
                laop_engaged: true,
                estimated_latency: estimatedLatency
            });
        }

        let agentResponse = "I'm not sure how to help with that yet."; // Default agentResponse
        let bftTriggered = false; // Initialize bftTriggered

        if (lower.includes('status') || lower.includes('report')) {
            agentResponse = "All systems nominal. ERC-8004 Identity Registry is live on Base Sepolia. All 12 agents are registered.";
        } else if (lower.includes('buy') || lower.includes('sell') || lower.includes('eth') || lower.includes('trade')) {
            agentResponse = `Order intent detected: "${transcript}". Triggering BFT consensus among 12 agents. Please stand by for confirmation.`;
            bftTriggered = true; // Set bftTriggered

            // SIMULATE BFT TRIGGER
            try {
                const { supabaseAdmin } = await import('@/lib/supabase');
                await supabaseAdmin.from('trinity_agent_logs').insert([
                    { agent_name: 'ORCH', message: `📢 BFT VOTE STARTED: ${transcript}`, action: 'BFT_START' },
                    { agent_name: 'VERITAS', message: `🗳️ Voting APPROVE for trade: ${transcript}`, action: 'BFT_VOTE' },
                    { agent_name: 'NEXUS', message: `🗳️ Voting APPROVE for trade: ${transcript}`, action: 'BFT_VOTE' }
                ]);

                const { telegramManager } = await import('@/lib/telegram/TelegramManager');
                await telegramManager.sendAlert(`🗳️ *BFT Consensus Triggered*\nIntent: "${transcript}"\nStatus: \`3/12\` votes collected. Waiting for swarm...`);
            } catch (e) {
                console.error('[VOICE] BFT Log failed:', e);
            }
        } else if (lower.includes('flower')) {
            agentResponse = "Understood. Initiating flower delivery coordination via the Social agent.";
        } else if (lower.includes('pizza')) {
            agentResponse = "Ordering pizza now via Torch agent. Domino's tracking will be sent to your Telegram.";
        }

        // 3. TTS (ElevenLabs) - Only if it was originally audio or explicitly requested
        const ELEVEN_LABS_KEY = process.env.ELEVEN_LABS_API_KEY;
        if (isAudio && ELEVEN_LABS_KEY) {
            console.log('[VOICE] Step 3: Generating ElevenLabs audio response...');
            const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel

            const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVEN_LABS_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: agentResponse,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
                })
            });

            if (ttsResponse.ok) {
                const audioBuffer = await ttsResponse.arrayBuffer();
                return new NextResponse(audioBuffer, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'X-Transcript': encodeURIComponent(transcript),
                        'X-Agent-Response': encodeURIComponent(agentResponse)
                    }
                });
            }
        }

        // Default JSON response for text-based tests
        return NextResponse.json({
            transcript,
            agentResponse,
            status: 'success',
            bft_triggered: lower.includes('buy') || lower.includes('eth')
        });

    } catch (error: any) {
        console.error('[VOICE] Pipeline failure:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
