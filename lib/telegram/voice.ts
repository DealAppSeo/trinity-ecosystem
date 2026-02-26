import axios from 'axios';

const HF_TOKEN = process.env.HF_TOKEN;
const WHISPER_API_URL = 'https://api-inference.huggingface.co/models/openai/whisper-small';

export async function transcribeVoice(fileUrl: string): Promise<{ text: string; confidence: number }> {
    try {
        // Download audio from Telegram
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const audioData = response.data;

        // Use HF Inference API (Zero Cost)
        if (HF_TOKEN) {
            const hfResponse = await axios.post(WHISPER_API_URL, audioData, {
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/octet-stream'
                }
            });

            return {
                text: hfResponse.data.text || '',
                confidence: 0.8 // HF doesn't always provide confidence scores, defaulting to high
            };
        }

        return { text: '', confidence: 0 };
    } catch (error: any) {
        console.error('[Voice] Transcription failed:', error.message);
        throw error;
    }
}
