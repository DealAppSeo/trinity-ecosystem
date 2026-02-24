import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function setMenuButton() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const webAppUrl = 'https://app.aitrinitysymphony.com';

    if (!token) {
        console.error('❌ Missing TELEGRAM_BOT_TOKEN');
        return;
    }

    console.log('🎼 Setting Bot Menu Button to:', webAppUrl);

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                menu_button: {
                    type: 'web_app',
                    text: '🎼 Symphony',
                    web_app: { url: webAppUrl }
                }
            })
        });

        const data = await response.json();
        if (data.ok) {
            console.log('✅ Menu Button set successfully! Re-open your bot to see the "Symphony" button.');
        } else {
            console.error('❌ Failed to set menu button:', data.description);
        }
    } catch (e: any) {
        console.error('❌ Error:', e.message);
    }
}

setMenuButton();
