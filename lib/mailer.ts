export interface EmailData {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export async function sendEmail({ to, subject, text, html }: EmailData) {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN || 'mg.aitrinitysymphony.com';

    if (!apiKey) {
        console.warn(`[Mailer] MAILGUN_API_KEY not found. Skipping email to ${to}.`);
        console.log(`[Email Mock] Subject: ${subject}\nTo: ${to}\nText: ${text}`);
        return;
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const formData = new URLSearchParams();
    formData.append('from', `Trinity Symphony <noreply@${domain}>`);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', text);
    if (html) formData.append('html', html);

    try {
        const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!res.ok) {
            const error = await res.text();
            console.error(`[Mailer] Mailgun error: ${error}`);
        } else {
            console.log(`[Mailer] Email sent to ${to}: ${subject}`);
        }
    } catch (err) {
        console.error(`[Mailer] Network error:`, err);
    }
}

// Cohort Specific Emails
export async function sendCohortWelcome(to: string, spotNumber: number) {
    await sendEmail({
        to,
        subject: `[Founding Cohort] Application received — Spot #${spotNumber}`,
        text: `Your application for the Trinity Symphony Founding Cohort has been received! 
    
You are currently spot #${spotNumber} in the queue. 

Sean is personally reviewing 'what would you break' answers to select the first 12 members. We'll be in touch within 24-48 hours.

In the meantime, you can follow progress on LinkedIn: https://linkedin.com/in/privatemoney`
    });
}
