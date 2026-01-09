import { MCPServer, MCPTool } from '../types';
import puppeteer, { Browser } from 'puppeteer';

export class PuppeteerMCP implements MCPServer {
    name = 'Puppeteer';
    version = '1.0.0';
    private browser: Browser | null = null;

    async initialize(): Promise<void> {
        console.log('[PuppeteerMCP] Initializing...');
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'browse_page',
                description: 'Visit a webpage and extract its text content as markdown. Optimized for reading articles, docs, and text-heavy sites.',
                schema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'The absolute URL to visit.' },
                    },
                    required: ['url']
                },
                execute: async (args: any) => {
                    return await this.browsePage(args.url);
                }
            },
            {
                name: 'take_screenshot',
                description: 'Visit a webpage and take a full-page screenshot. Returns a file path to the saved image.',
                schema: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'The absolute URL to visit.' },
                        filename: { type: 'string', description: 'The filename to save as (without path), e.g. "google_home.png".' }
                    },
                    required: ['url', 'filename']
                },
                execute: async (args: any) => {
                    return await this.takeScreenshot(args.url, args.filename);
                }
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<any> {
        switch (toolName) {
            case 'browse_page':
                return await this.browsePage(args.url);
            case 'take_screenshot':
                return await this.takeScreenshot(args.url, args.filename);
            default:
                throw new Error(`Tool ${toolName} not found in PuppeteerMCP`);
        }
    }

    private async getBrowser() {
        if (!this.browser) {
            console.log('[PuppeteerMCP] Launching Headless Browser...');
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            });
        }
        return this.browser;
    }

    public async browsePage(url: string): Promise<string> {
        // Ensure browser is initialized
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            console.log(`[PuppeteerMCP] Navigating to ${url}...`);

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Simple extraction script
            const content = await page.evaluate(() => {
                // Remove scripts, styles, etc.
                const scripts = document.querySelectorAll('script, style, noscript');
                scripts.forEach(s => s.remove());
                return document.body.innerText;
            });

            return `## Content from ${url}\n\n${content.substring(0, 15000)}`; // Truncate vast content
        } catch (error: any) {
            return `Error browsing ${url}: ${error.message}`;
        } finally {
            await page.close();
        }
    }

    public async takeScreenshot(url: string, filename: string): Promise<string> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const artifactsDir = './artifacts';
            const fs = require('fs');
            if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

            const filePath = `${artifactsDir}/${filename}`;
            await page.screenshot({ path: filePath, fullPage: true });

            console.log(`[PuppeteerMCP] Screenshot saved to ${filePath}`);
            return `file:///${process.cwd()}/${filePath}`;
        } catch (error: any) {
            return `Error screenshotting ${url}: ${error.message}`;
        } finally {
            await page.close();
        }
    }
}
