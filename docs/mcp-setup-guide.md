# Integrating the MCP Server in TuneCamp

TuneCamp implements the **Model Context Protocol (MCP)**, allowing AI clients (such as Claude Desktop) to connect, search your music catalog, trigger file scans, and check server statistics.

Since most AI clients (including Claude Desktop) natively support only local connections via `stdio` (standard input/output), TuneCamp provides both a protected **SSE (Server-Sent Events)** server and a **local bridge** utility so the two systems can talk to each other securely.

---

## 1. Generate an API Token

All MCP requests are protected. To connect, you must first create a token:
1. Sign in to TuneCamp with your administrator or curator account.
2. Go to **Profile Settings** -> **API Tokens** section.
3. Click **Create New Token**, enter a name (e.g. "Claude Desktop"), and confirm.
4. Copy the generated token (it starts with `tc_`). *Note: you will not be able to view it in full again after creation.*

---

## 2. Configure Claude Desktop

Open the Claude Desktop configuration file (`claude_desktop_config.json`):
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the `tunecamp` server under the `mcpServers` section. Make sure to point to the folder where TuneCamp is installed (replace the absolute path and the `tc_...` token with your own):

```json
{
  "mcpServers": {
    "tunecamp": {
      "command": "node",
      "args": [
        "d:/shogun-2/tunecamp/dist/server/tools/mcp-bridge.js",
        "http://localhost:1970/api/mcp/sse",
        "tc_your_token_here"
      ]
    }
  }
}
```

*Note: before starting the bridge, make sure you have built the TuneCamp project so that the `mcp-bridge.js` file exists in the `dist/` folder:*
```bash
npm run build
```

---

## 3. Exported & Available Tools

Once connected, your AI chatbot will have access to the following tools:

### `search_music`
- **Description**: Searches artists, albums, and tracks in the local library.
- **Parameters**:
  - `query` (string, required): Text to search for.

### `list_recent_albums`
- **Description**: Shows the most recently added albums in the TuneCamp library.
- **Parameters**:
  - `limit` (integer, optional): Maximum number of albums (default 20, max 100).

### `scan_library`
- **Description**: Starts an asynchronous background scan of the server's music directory to detect new audio files or updates.

### `get_system_stats`
- **Description**: Returns global statistics about the TuneCamp instance (number of artists, total albums, tracks, and total disk space used).

---

## 4. Adding a new MCP Tool (for developers)

The tools are defined directly in the MCP server, in a single file: [`src/server/routes/api/mcp.ts`](../src/server/routes/api/mcp.ts).

Adding a tool requires **two changes** in the same file, plus a rebuild.

### Step 1 — Declare the tool (`ListTools` handler)

Add an entry to the `tools` array returned by the `ListToolsRequestSchema` handler. This is where the AI client discovers the tool and its input schema (JSON Schema):

```typescript
{
    name: "get_artist_releases",
    description: "List all releases by a given artist.",
    inputSchema: {
        type: "object",
        properties: {
            artist: { type: "string", description: "Artist name or slug" }
        },
        required: ["artist"]
    }
}
```

### Step 2 — Implement the tool (`CallTool` handler)

Add a `case` to the `switch (name)` inside the `CallToolRequestSchema` handler. The `name` must match exactly the one from Step 1. The instance services are already available through the `container` destructured at the top of the function (`library`, `database`, `scannerService`, `config`):

```typescript
case "get_artist_releases": {
    const artist = String(args?.artist || "").trim();
    if (!artist) {
        throw new McpError(ErrorCode.InvalidParams, "artist parameter is required");
    }
    const rows = database.db.prepare(`
        SELECT a.title, a.year FROM albums a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        WHERE ar.name LIKE ? OR ar.slug = ?
        ORDER BY a.year DESC
    `).all(`%${artist}%`, artist);

    const text = rows.length
        ? rows.map((r: any) => `- ${r.title} (${r.year || "N/A"})`).join("\n")
        : "No releases found.";

    // Every tool must return { content: [{ type: "text", text }] }
    return { content: [{ type: "text", text }] };
}
```

**Important rules:**
- **Always** return `{ content: [{ type: "text", text }] }`. To signal a "soft" error add `isError: true`; for a validation/parameter error throw an `McpError` (`ErrorCode.InvalidParams`, `MethodNotFound`, etc.).
- For read queries use `library.search(...)` (which respects visibility — see `VisibilityProfile`) or direct SQL via `database.db.prepare(...)`.
- For heavy/async work **do not block**: launch it with `taskManager.run("task-id", fn)` and return a message immediately (see `scan_library` as an example), so the AI does not have to wait.
- All MCP routes are already protected by the `tc_...` token; you do not need to add auth in the individual tool.

### Step 3 — Rebuild and restart

```bash
npm run build   # regenerates dist/, including the bridge mcp-bridge.js
```

Restart the TuneCamp instance and restart the client (Claude Desktop) to reload the tool list.
