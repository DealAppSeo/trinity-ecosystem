
import { BaseMCP } from './BaseMCP';
// Note: We import chromium from playwright purely to launch.
// In a real localized environment we might need 'playwright-core' or rely on installed browsers.
import { chromium, Browser, Page } from 'playwright';

export class PlaywrightMCP extends BaseMCP {
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor() {
        super('Playwright');
    }

    async connect(): Promise<void> {
        // We assume we can launch a browser.
        // In some serverless envs (like Vercel strict) this might fail,
        // but for a Railway container or local, it works.
        try {
            this.browser = await chromium.launch({ headless: true });
            this.page = await this.browser.newPage();
            console.log(`[PlaywrightMCP] Browser launched.`);
        } catch (e: any) {
            console.warn(`[PlaywrightMCP] Failed to launch browser: ${e.message}`);
            // Don't throw, just allow initialization so other MCPs work, 
            // but tools will fail if called.
        }

        this.registerTool({
            name: 'browse_page',
            description: 'Visit a URL and extract its text content',
            schema: {
                type: 'object',
                properties: {
                    url: { type: 'string' }
                },
                required: ['url']
            },
            execute: this.browsePage.bind(this)
        });

        this.registerTool({
            name: 'take_screenshot',
            description: 'Take a screenshot of a URL',
            schema: {
                type: 'object',
                properties: {
                    url: { type: 'string' }
                },
                required: ['url']
            },
            execute: this.takeScreenshot.bind(this)
        });
    }

    private async browsePage(args: { url: string }): Promise<string> {
        if (!this.page) throw new Error('Browser not initialized');
        await this.page.goto(args.url, { waitUntil: 'domcontentloaded' });
        const content = await this.page.evaluate(() => document.body.innerText);
        return content.substring(0, 5000) + '... (truncated)';
    }

    private async takeScreenshot(args: { url: string }): Promise<string> {
        if (!this.page) throw new Error('Browser not initialized');
        await this.page.goto(args.url, { waitUntil: 'networkidle' });
        const buffer = await this.page.screenshot();
        // Return base64 for now, or upload to blob storage in real App
        return `[IMAGE: ${buffer.toString('base64').substring(0, 50)}...] (Base64 Truncated for Log)`;
    }
}
