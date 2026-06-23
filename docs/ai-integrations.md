# AI Integrations

TuneCamp leverages Artificial Intelligence to automate metadata enrichment, improve recommendations, and simplify content ingestion.

## 1. Provider: OpenRouter

The primary AI engine is **OpenRouter**, which provides a unified API access to multiple LLMs (Large Language Models).

- **Service**: `src/server/modules/ai/openrouter.service.ts`
- **Default Model**: Configurable via `openrouter_model` (defaults to `openrouter/free` models like `meta-llama/llama-3-8b-instruct:free`).

## 2. Key Features

### Metadata Enrichment
- **Purpose**: Automatically fills in missing details for tracks and albums.
- **Data Extracted**: Genre, Release Year, Mood, Style Tags, and short descriptions.
- **Workflow**: When a new item is scanned or manually enriched, the system sends the title and artist to the AI to "guess" or provide canonical metadata.

### Intelligent Content Ingestion (Telegram)
- **Purpose**: Parses messy text or captions into structured data.
- **Functionality**: When an audio file is sent to the Telegram bot with a caption, the AI extracts the Artist, Album, Year, and even detects **Bandcamp URLs** to trigger further scraping.

### Smart Recommendations
- **Purpose**: Suggests "Similar Tracks" based on musicality rather than just simple tags.
- **Mechanism**: The system provides the AI with a list of "candidate" tracks from the local library. The AI analyzes the style, mood, and era to return the top 5 most relevant recommendations.

### Artist & Album Identification
- **Purpose**: Helps confirm identities against external databases like MusicBrainz.
- **Functionality**: The AI generates "refined search queries" and short biographies to help the server find the exact match in global music databases.

## 3. Configuration

To enable AI features, you must configure an OpenRouter API Key.

### Environment Variables
- `OPENROUTER_API_KEY`: Your OpenRouter secret key.
- `OPENROUTER_MODEL`: (Optional) The specific model ID to use.

### Database Settings (Admin UI)
- `openrouter_api_key`: Can be set directly in the Admin dashboard.
- `openrouter_model`: Can be overridden per instance.

## 4. Optimization & Costs

To keep costs low (or zero):
1. **Free Models**: TuneCamp is optimized to work with OpenRouter's free tier models.
2. **Aggressive Caching**: AI results are cached in the SQLite database. The system never asks the same question twice for the same track/artist.
3. **Selective Triggers**: AI enrichment is typically triggered by admin actions or during initial ingestion, not on every user request.

## 5. Model Context Protocol (MCP)

TuneCamp can act as an MCP server, allowing external AI clients (such as Claude Desktop or custom agents) to query and control your TuneCamp instance. 
For detailed instructions on generating API keys and configuring your AI client, see the [mcp-setup-guide.md](./mcp-setup-guide.md).
