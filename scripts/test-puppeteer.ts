
import { PuppeteerMCP } from '../lib/mcp/servers/PuppeteerMCP';

async function testPuppeteer() {
    console.log('Testing PuppeteerMCP...');
    const mcp = new PuppeteerMCP();

    // 1. Initialize
    await mcp.initialize();
    console.log('Initialized.');

    // 2. Test browse_page
    console.log('Testing browse_page...');
    try {
        const content = await mcp.callTool('browse_page', { url: 'https://example.com' });
        console.log('Browse Result Preview:', content.substring(0, 200));
        if (content.includes('Example Domain')) {
            console.log('✅ browse_page PASS');
        } else {
            console.error('❌ browse_page FAIL: Content mismatch');
        }
    } catch (e: any) {
        console.error('❌ browse_page ERROR:', e.message);
    }

    // 3. Test take_screenshot
    console.log('Testing take_screenshot...');
    try {
        const path = await mcp.callTool('take_screenshot', { url: 'https://example.com', filename: 'test_puppeteer_example.png' });
        console.log('Screenshot Result:', path);
        if (path.includes('test_puppeteer_example.png')) {
            console.log('✅ take_screenshot PASS');
        } else {
            console.error('❌ take_screenshot FAIL');
        }
    } catch (e: any) {
        console.error('❌ take_screenshot ERROR:', e.message);
    }

    process.exit(0);
}

testPuppeteer();
