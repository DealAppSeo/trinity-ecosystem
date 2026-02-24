import crypto from 'crypto';

/**
 * Verifies the authenticity of data received from the Telegram WebApp.
 * @param initData The raw initData string from the Telegram WebApp SDK
 * @param botToken The TELEGRAM_BOT_TOKEN from environment variables
 */
export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    // Sort parameters alphabetically
    const params = Array.from(urlParams.entries())
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('\n');

    // Create secret key from bot token
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    // Generate validation hash
    const validationHash = crypto
        .createHmac('sha256', secretKey)
        .update(params)
        .digest('hex');

    return validationHash === hash;
}
