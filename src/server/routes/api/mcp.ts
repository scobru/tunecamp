import { Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError
} from "@modelcontextprotocol/sdk/types.js";
import { taskManager } from "../../modules/workers/task-manager.js";
import { VisibilityProfile } from "../../common/visibility.js";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export function createMcpRoutes(container: ServiceContainer): Router {
    const router = Router();
    const { library, database, scannerService, config } = container;

    // Create the MCP server instance
    const mcpServer = new Server(
        {
            name: "tunecamp-mcp-server",
            version: "1.0.0"
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    // Register ListTools request handler
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "search_music",
                    description: "Search for tracks, albums, or artists in the TuneCamp library.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query (e.g. artist name, track title, album title)"
                            }
                        },
                        required: ["query"]
                    }
                },
                {
                    name: "list_recent_albums",
                    description: "Retrieve a list of the most recently added library albums.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            limit: {
                                type: "integer",
                                description: "Maximum number of albums to return (default: 20)",
                                minimum: 1,
                                maximum: 100
                            }
                        }
                    }
                },
                {
                    name: "scan_library",
                    description: "Trigger a background scan of the local music directory to find new audio files.",
                    inputSchema: {
                        type: "object",
                        properties: {}
                    }
                },
                {
                    name: "get_system_stats",
                    description: "Get general system statistics including tracks count, albums count, and disk space usage.",
                    inputSchema: {
                        type: "object",
                        properties: {}
                    }
                }
            ]
        };
    });

    // Register CallTool request handler
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "search_music": {
                    const query = String(args?.query || "").trim();
                    if (!query) {
                        throw new McpError(ErrorCode.InvalidParams, "Query parameter is required");
                    }

                    const results = library.search(query, VisibilityProfile.ALL_ACCESS);
                    
                    // Format results nicely as readable text
                    let responseText = `Search results for "${query}":\n\n`;

                    if (results.artists.length > 0) {
                        responseText += `Artists (${results.artists.length}):\n`;
                        results.artists.forEach(a => {
                            responseText += `- ${a.name} (Slug: ${a.slug})\n`;
                        });
                        responseText += "\n";
                    }

                    if (results.albums.length > 0) {
                        responseText += `Albums (${results.albums.length}):\n`;
                        results.albums.forEach(a => {
                            responseText += `- ${a.title} by ${a.artist_name || "Unknown"} (Slug: ${a.slug}, Year: ${a.year || "N/A"})\n`;
                        });
                        responseText += "\n";
                    }

                    if (results.tracks.length > 0) {
                        responseText += `Tracks (${results.tracks.length}):\n`;
                        results.tracks.forEach(t => {
                            responseText += `- "${t.title}" by ${t.artist_name || "Unknown"} (Album: ${t.album_title || "N/A"}, Duration: ${Math.round(t.duration || 0)}s)\n`;
                        });
                    }

                    if (results.artists.length === 0 && results.albums.length === 0 && results.tracks.length === 0) {
                        responseText += "No results found.";
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: responseText
                            }
                        ]
                    };
                }

                case "list_recent_albums": {
                    const limit = Number(args?.limit ?? 20);
                    const albums = database.db.prepare(`
                        SELECT a.id, a.title, a.slug, a.genre, a.year, a.created_at, ar.name as artist_name 
                        FROM albums a 
                        LEFT JOIN artists ar ON a.artist_id = ar.id 
                        ORDER BY a.created_at DESC 
                        LIMIT ?
                    `).all(limit) as any[];

                    let responseText = `Recent albums (limit ${limit}):\n\n`;
                    if (albums.length === 0) {
                        responseText += "No albums in library.";
                    } else {
                        albums.forEach((a, index) => {
                            responseText += `${index + 1}. "${a.title}" by ${a.artist_name || "Unknown Artist"} (${a.year || "N/A"}) - Added: ${a.created_at}\n`;
                        });
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: responseText
                            }
                        ]
                    };
                }

                case "scan_library": {
                    const isRunning = taskManager.getStatus("library-rescan")?.status === "running";
                    if (isRunning) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "A library scan is already in progress."
                                }
                            ]
                        };
                    }

                    const musicDir = config.musicDir;
                    const started = taskManager.run("library-rescan", async () => {
                        console.log(`🔍 [MCP] Starting manual library scan: ${musicDir}`);
                        const result = await scannerService.scanDirectory(musicDir, (processed, total) => {
                            taskManager.updateProgress("library-rescan", processed, total, `Scanning library: ${processed}/${total} files`);
                        });
                        console.log(`✅ [MCP] Scan complete. Processed ${result.successful.length} files.`);
                        return { processed: result.successful.length, failed: result.failed.length };
                    });

                    return {
                        content: [
                            {
                                type: "text",
                                text: started 
                                    ? "Library scan successfully started in the background." 
                                    : "Failed to start library scan."
                            }
                        ]
                    };
                }

                case "get_system_stats": {
                    const stats = await library.getStats();
                    
                    // Format byte sizes into readable MB/GB
                    const formatBytes = (bytes: number) => {
                        if (bytes === 0) return "0 Bytes";
                        const k = 1024;
                        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
                    };

                    const responseText = [
                        "TuneCamp System Statistics:",
                        `- Total Artists: ${stats.artists}`,
                        `- Total Albums: ${stats.albums} (${stats.publicAlbums} public)`,
                        `- Total Tracks: ${stats.tracks}`,
                        `- Total Storage Used: ${formatBytes(stats.storageUsed)}`,
                        `- Different Genres: ${stats.genresCount}`
                    ].join("\n");

                    return {
                        content: [
                            {
                                type: "text",
                                text: responseText
                            }
                        ]
                    };
                }

                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
        } catch (error: any) {
            console.error(`[MCP] Tool ${name} error:`, error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error executing tool: ${error.message || error}`
                    }
                ],
                isError: true
            };
        }
    });

    // Active SSE transport sessions
    let sseTransport: SSEServerTransport | null = null;

    // Establish the SSE connection channel
    router.get("/sse", (req: AuthenticatedRequest, res) => {
        console.log(`🔌 [MCP] SSE client connection opened for user ${req.username}`);
        
        sseTransport = new SSEServerTransport("/api/mcp/message", res);
        
        mcpServer.connect(sseTransport).catch(err => {
            console.error("[MCP] Connection error:", err);
        });

        // Clean up session reference when the request finishes
        res.on("close", () => {
            console.log(`🔌 [MCP] SSE connection closed for user ${req.username}`);
            sseTransport = null;
        });
    });

    // Client posts messages to the server through this channel
    router.post("/message", async (req: AuthenticatedRequest, res) => {
        if (!sseTransport) {
            res.status(400).json({ error: "No active MCP SSE session found. Connect to /sse first." });
            return;
        }

        try {
            await sseTransport.handlePostMessage(req, res);
        } catch (error) {
            console.error("[MCP] Message handling failed:", error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to process MCP message" });
            }
        }
    });

    return router;
}
