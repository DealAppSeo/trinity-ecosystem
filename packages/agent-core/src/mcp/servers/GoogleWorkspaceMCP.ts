
import { BaseMCP } from './BaseMCP';
import { google } from 'googleapis';

export class GoogleWorkspaceMCP extends BaseMCP {
    private auth: any;

    constructor() {
        super('GoogleWorkspace');
    }

    async connect(): Promise<void> {
        // We expect GOOGLE_APPLICATION_CREDENTIALS or similar env vars
        // For simplicity, we'll try to use Application Default Credentials (ADC)
        // or a specific API key if provided, but Workspace usually needs OAuth or Service Account.

        try {
            this.auth = new google.auth.GoogleAuth({
                scopes: [
                    'https://www.googleapis.com/auth/calendar.readonly',
                    'https://www.googleapis.com/auth/gmail.readonly'
                ]
            });
            const client = await this.auth.getClient();
            console.log(`[GoogleWorkspaceMCP] Client authenticated.`);
        } catch (e: any) {
            // throw new Error(`Google Auth Failed: ${e.message}`);
            console.warn(`[GoogleWorkspaceMCP] Auth failed (${e.message}). Tools may fail.`);
        }

        this.registerTool({
            name: 'list_calendar_events',
            description: 'List upcoming calendar events',
            schema: { type: 'object', properties: {}, required: [] },
            execute: this.listEvents.bind(this)
        });

        this.registerTool({
            name: 'list_emails',
            description: 'List recent emails',
            schema: { type: 'object', properties: { maxResults: { type: 'number' } }, required: [] },
            execute: this.listEmails.bind(this)
        });
    }

    private async listEvents(args: any): Promise<string> {
        if (!this.auth) throw new Error('Not authenticated');
        const calendar = google.calendar({ version: 'v3', auth: this.auth });
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items || [];
        return JSON.stringify(events.map((event: any) => ({
            summary: event.summary,
            start: event.start.dateTime || event.start.date
        })), null, 2);
    }

    private async listEmails(args: { maxResults?: number }): Promise<string> {
        if (!this.auth) throw new Error('Not authenticated');
        const gmail = google.gmail({ version: 'v1', auth: this.auth });
        const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: args.maxResults || 5
        });
        return JSON.stringify(res.data.messages, null, 2);
    }
}
