/**
 * TuneCamp MCP Bridge
 * 
 * Bridges standard input/output (stdio) to a remote Server-Sent Events (SSE) MCP server.
 * This is useful for tools like Claude Desktop that only support local command-line launching of MCP servers.
 * 
 * Usage:
 *   node dist/server/tools/mcp-bridge.js <sse-url> <api-key>
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
    const sseUrl = process.argv[2];
    const token = process.argv[3];

    if (!sseUrl) {
        console.error("Usage: node mcp-bridge.js <sse-url> <api-key>");
        process.exit(1);
    }

    console.error(`[MCP-Bridge] Connecting to SSE server at: ${sseUrl}`);

    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const transport = new SSEClientTransport(new URL(sseUrl), {
        eventSourceInit: {
            headers
        } as any
    });

    const stdioTransport = new StdioServerTransport();

    // Route messages from Claude Desktop (Stdio) -> Remote TuneCamp (SSE)
    stdioTransport.onmessage = (message) => {
        transport.send(message).catch(err => {
            console.error("[MCP-Bridge] Failed to send message to SSE:", err);
        });
    };

    // Route messages from Remote TuneCamp (SSE) -> Claude Desktop (Stdio)
    transport.onmessage = (message) => {
        stdioTransport.send(message).catch(err => {
            console.error("[MCP-Bridge] Failed to send message to Stdio:", err);
        });
    };

    transport.onerror = (error) => {
        console.error("[MCP-Bridge] SSE transport error:", error);
    };

    stdioTransport.onerror = (error) => {
        console.error("[MCP-Bridge] Stdio transport error:", error);
    };

    transport.onclose = () => {
        console.error("[MCP-Bridge] SSE transport closed");
        process.exit(0);
    };

    stdioTransport.onclose = () => {
        console.error("[MCP-Bridge] Stdio transport closed");
        process.exit(0);
    };

    // Connect both transports
    try {
        await Promise.all([
            transport.start(),
            stdioTransport.start()
        ]);
        console.error("[MCP-Bridge] Connection established. Bridging messages...");
    } catch (err: any) {
        console.error("[MCP-Bridge] Connection failed to start:", err.message || err);
        process.exit(1);
    }
}

main().catch(err => {
    console.error("[MCP-Bridge] Fatal error in bridge:", err);
    process.exit(1);
});
