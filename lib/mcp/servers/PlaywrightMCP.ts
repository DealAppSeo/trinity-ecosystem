import { BaseMCP } from './BaseMCP';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export class PlaywrightMCP extends BaseMCP {
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor() {
        super('Playwright');
    }

    async connect(): Promise<void> {
        try {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log(`[PlaywrightMCP] Browser launched.`);
        } catch (e: any) {
            console.warn(`[PlaywrightMCP] Failed to launch browser: ${e.message}`);
        }

        this.registerTool({
            name: 'browse_page',
            description: 'Visit a URL and extract its text content. Use this for research or viewing page data.',
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
            description: 'Take a screenshot of a webpage and save it to artifacts. Useful for UI/UX review.',
            schema: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    filename: { type: 'string', description: 'Name of the file (e.g., "dashboard.png")' }
                },
                required: ['url', 'filename']
            },
            execute: this.takeScreenshot.bind(this)
        });

        this.registerTool({
            name: 'click_element',
            description: 'Click an element on the current page using a CSS selector.',
            schema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector of the element to click.' },
                    waitAfter: { type: 'number', description: 'MS to wait after clicking.', default: 1000 }
                },
                required: ['selector']
            },
            execute: this.clickElement.bind(this)
        });

        this.registerTool({
            name: 'type_text',
            description: 'Type text into an input field.',
            schema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector of the input field.' },
                    text: { type: 'string', description: 'Text to type.' }
                },
                required: ['selector', 'text']
            },
            execute: this.typeText.bind(this)
        });
    }

    private async getPage(): Promise<Page> {
        if (!this.browser) throw new Error('Browser not initialized');
        if (!this.page || this.page.isClosed()) {
            this.page = await this.browser.newPage();
            await this.page.setViewportSize({ width: 1280, height: 800 });
        }
        return this.page;
    }

    private async browsePage(args: { url: string }): Promise<string> {
        const page = await this.getPage();
        await page.goto(args.url, { waitUntil: 'networkidle' });
        const content = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script, style, noscript');
            scripts.forEach(s => s.remove());
            return document.body.innerText;
        });
        return content.substring(0, 10000) + (content.length > 10000 ? '... (truncated)' : '');
    }

    private async takeScreenshot(args: { url: string, filename: string }): Promise<string> {
        const page = await this.getPage();
        await page.goto(args.url, { waitUntil: 'networkidle' });

        const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'screenshots');
        if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

        const filePath = path.join(artifactsDir, args.filename);
        await page.screenshot({ path: filePath, fullPage: true });

        return `SUCCESS: Screenshot saved to artifacts/screenshots/${args.filename}. [Visual: ${args.filename}]`;
    }

    private async clickElement(args: { selector: string, waitAfter?: number }): Promise<string> {
        const page = await this.getPage();
        await page.click(args.selector);
        if (args.waitAfter) {
            await new Promise(r => setTimeout(r, args.waitAfter!));
        }
        return `SUCCESS: Clicked element '${args.selector}'.`;
    }

    private async typeText(args: { selector: string, text: string }): Promise<string> {
        const page = await this.getPage();
        await page.fill(args.selector, args.text);
        return `SUCCESS: Typed text into '${args.selector}'.`;
    }
}
