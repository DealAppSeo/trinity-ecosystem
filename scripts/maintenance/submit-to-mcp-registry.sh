#!/bin/bash
# scripts/submit-to-mcp-registry.sh

echo "📦 Submitting Trinity MCP servers to official registry..."

# Submit each custom server (URLs are examples, update to public URLs when available)
npx mcp-index https://github.com/DealAppSeo/trinity-ecosystem/tree/main/packages/mcp-servers/orchestrator
npx mcp-index https://github.com/DealAppSeo/trinity-ecosystem/tree/main/packages/mcp-servers/repid
npx mcp-index https://github.com/DealAppSeo/trinity-ecosystem/tree/main/packages/mcp-servers/constitutional

echo "✅ Submitted! Check https://mcp.so for listing status."
