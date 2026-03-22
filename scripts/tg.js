const https = require('https');
require('dotenv').config({ path: '.env.local' });

const sendTelegram = (message) => {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
    
    if (!token || !chatId) {
      console.log("No TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_CHAT_ID in env. Skipping TX transmission.");
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      supabase.from('sprint_reports').insert({
          agent_name: 'ORCH',
          report_type: 'telegram_fallback',
          content: `Missed Telegram message: ${message}`
      }).then(resolve).catch(resolve);
      return;
    }

    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log(`[TG] Transmitted: ${message}`);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error("[TG] Exception:", e.message);
      resolve();
    });

    req.write(data);
    req.end();
  });
};

const msg = process.argv[2];
if (msg) {
    sendTelegram(msg).then(() => process.exit(0));
}
