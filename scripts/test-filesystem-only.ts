
import 'dotenv/config';
import { FileSystemMCP } from '../lib/mcp/servers/FileSystemMCP';

async function main() {
    console.log('🧪 Testing FileSystemMCP independently...');

    const fsMcp = new FileSystemMCP();
    await fsMcp.connect();

    console.log('📂 connected. Tools:', (await fsMcp.getTools()).map(t => t.name).join(', '));

    const content = 'This is a direct test of the file system MCP.';
    const result = await fsMcp.callTool('write_file', {
        filename: 'direct_test.txt',
        content: content
    });

    console.log('📝 Write Result:', result);

    // Verify read
    const readBack = await fsMcp.callTool('read_file', { filename: 'direct_test.txt' });
    console.log('📖 Read Result:', readBack === content ? 'MATCH' : 'MISMATCH');
}

main().catch(console.error);
