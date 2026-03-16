import axios from 'axios';

const HF_TOKEN = process.env.HF_TOKEN;
const WHISPER_API_URL = 'https://api-inference.huggingface.co/models/openai/whisper-small';

export async function transcribeVoice(fileUrl: string): Promise<{ text: string; confidence: number }> {
    try {
        // Download audio from Telegram
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const audioData = response.data;

        // Use Groq Whisper API (Faster & Supports OGA)
        const GROQ_KEY = process.env.GROQ_API_KEY;
        if (GROQ_KEY) {
            const formData = new FormData();
            const blob = new Blob([audioData], { type: 'audio/ogg' });
            formData.append('file', blob, 'voice.oga');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('response_format', 'json');

            const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`
                },
                body: formData as any
            });

            if (groqResponse.ok) {
                const data = await groqResponse.json();
                return {
                    text: data.text || '',
                    confidence: 0.95
                };
            } else {
                console.error('[Voice] Groq transcription error:', await groqResponse.text());
            }
        }

        // Fallback to HF Inference API
        if (HF_TOKEN) {
            const hfResponse = await axios.post(WHISPER_API_URL, audioData, {
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/octet-stream'
                }
            });

            return {
                text: hfResponse.data.text || '',
                confidence: 0.8
            };
        }

        return { text: '', confidence: 0 };
    } catch (error: any) {
        console.error('[Voice] Transcription failed:', error.message);
        throw error;
    }
}
