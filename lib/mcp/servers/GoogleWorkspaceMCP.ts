
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
                    'https://www.googleapis.com/auth/gmail.readonly',
                    'https://www.googleapis.com/auth/spreadsheets'
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

        this.registerTool({
            name: 'create_spreadsheet',
            description: 'Create a new Google Spreadsheet with initial data.',
            schema: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    rows: {
                        type: 'array',
                        items: { type: 'array', items: { type: 'string' } },
                        description: '2D array of strings representing rows and columns'
                    }
                },
                required: ['title', 'rows']
            },
            execute: this.createSpreadsheet.bind(this)
        });

        this.registerTool({
            name: 'read_spreadsheet',
            description: 'Read data from a Google Spreadsheet range.',
            schema: {
                type: 'object',
                properties: {
                    spreadsheetId: { type: 'string' },
                    range: { type: 'string', description: 'Sheet range e.g. "Sheet1!A1:Z100"' }
                },
                required: ['spreadsheetId', 'range']
            },
            execute: this.readSpreadsheet.bind(this)
        });

        this.registerTool({
            name: 'update_spreadsheet_values',
            description: 'Update or append values to a Google Spreadsheet.',
            schema: {
                type: 'object',
                properties: {
                    spreadsheetId: { type: 'string' },
                    range: { type: 'string', description: 'Starting cell e.g. "Sheet1!A1"' },
                    rows: {
                        type: 'array',
                        items: { type: 'array', items: { type: 'string' } },
                        description: '2D array of strings'
                    }
                },
                required: ['spreadsheetId', 'range', 'rows']
            },
            execute: this.updateSpreadsheet.bind(this)
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

    private async createSpreadsheet(args: { title: string, rows: string[][] }): Promise<string> {
        if (!this.auth) throw new Error('Not authenticated');
        const sheets = google.sheets({ version: 'v4', auth: this.auth });

        try {
            const spreadsheet = await sheets.spreadsheets.create({
                requestBody: {
                    properties: { title: args.title }
                }
            });

            const spreadsheetId = spreadsheet.data.spreadsheetId;
            if (spreadsheetId && args.rows.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: 'Sheet1!A1',
                    valueInputOption: 'RAW',
                    requestBody: { values: args.rows }
                });
            }

            return `Spreadsheet created: ${spreadsheet.data.spreadsheetUrl}. ID: ${spreadsheetId}`;
        } catch (e: any) {
            return `Failed to create spreadsheet: ${e.message}`;
        }
    }

    private async readSpreadsheet(args: { spreadsheetId: string, range: string }): Promise<string> {
        if (!this.auth) throw new Error('Not authenticated');
        const sheets = google.sheets({ version: 'v4', auth: this.auth });
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: args.spreadsheetId,
                range: args.range
            });
            return JSON.stringify(res.data.values, null, 2);
        } catch (e: any) {
            return `Error reading spreadsheet: ${e.message}`;
        }
    }

    private async updateSpreadsheet(args: { spreadsheetId: string, range: string, rows: string[][] }): Promise<string> {
        if (!this.auth) throw new Error('Not authenticated');
        const sheets = google.sheets({ version: 'v4', auth: this.auth });
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: args.spreadsheetId,
                range: args.range,
                valueInputOption: 'RAW',
                requestBody: { values: args.rows }
            });
            return `Successfully updated spreadsheet ${args.spreadsheetId} at ${args.range}`;
        } catch (e: any) {
            return `Error updating spreadsheet: ${e.message}`;
        }
    }
}
