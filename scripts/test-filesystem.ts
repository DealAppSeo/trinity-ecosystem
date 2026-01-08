
import { FileSystemMCP } from '../lib/mcp/servers/FileSystemMCP';

async function testFileSystem() {
    console.log('Testing FileSystemMCP...');
    const fsMcp = new FileSystemMCP();
    await fsMcp.initialize();

    console.log('1. Write File');
    const writeResult = await fsMcp.callTool('write_file', {
        path: 'test_artifact_v2.md',
        content: '# Hello V2\nThis is a test artifact signed by RepID.'
    });
    console.log('Result:', writeResult);

    console.log('2. Read File');
    const readResult = await fsMcp.callTool('read_file', {
        path: 'test_artifact_v2.md'
    });
    console.log('Content:', readResult);

    if (readResult.includes('RepID')) {
        console.log('✅ PASS: RepID signature found.');
    } else {
        console.error('❌ FAIL: RepID signature missing.');
    }
}

testFileSystem();
