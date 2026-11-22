# AI Integrations

TuneCamp uses **OpenRouter** to power a conversational, tool-using **AI Library Assistant**, smart track recommendations, and intelligent Telegram caption parsing.

## 1. Provider: OpenRouter

- **Service**: `src/server/modules/ai/openrouter.service.ts`
- **Default Model**: Configurable via `OPENROUTER_MODEL` or `openrouter_model` in **Admin → Integrations** (defaults to `openrouter/free`).
- **Recommendation**: Select a tool-capable model (such as `google/gemini-2.5-flash`, `openai/gpt-4o-mini`, or `anthropic/claude-sonnet-4`) for best results with the AI Library Assistant.

## 2. AI Library Assistant

- **Service**: `src/server/modules/ai/assistant.service.ts`
- **API**: `GET /api/ai/status`, `POST /api/ai/chat`, `POST /api/ai/apply`
- **UI Locations**:
  - **Admin → Maintenance**: Inline assistant alongside system operations (`Rescan Library`, `Sync Tags`, `Pre-warm Cache`, `Optimize DB`).
  - **My Catalog → Tracks / Albums** & **Album Details**: Contextual **Ask AI** button that automatically passes selected or filtered tracks/albums as context.

### Tool-Calling & Preview-Before-Apply Workflow

Instead of rigid single-field batch forms, the AI Library Assistant uses OpenAI-compatible function calling over TuneCamp's own catalog and metadata providers:

1. **Inspect**: `search_library`, `get_album_details`, `list_missing_metadata` (including `generic_titles` for `AudioTrack 01..` placeholders), and `get_library_stats`.
2. **Lookup**: `search_external_releases`, `get_external_release_tracklist` (fetches official tracklists with track numbers and durations from iTunes, MusicBrainz, and Discogs), `search_external_recordings`, and `search_external_artists`.
3. **Stage Diffs**: `propose_track_updates`, `propose_album_update`, `propose_artist_update`, and `propose_system_action` (admin only).
4. **Confirm & Apply**: Write actions never mutate the database automatically. The assistant returns a structured proposal (`before → after` diffs) for review; clicking **Apply Selected** persists the checked edits via `CatalogService` and syncs ID3/file tags.

## 3. Additional AI Features

- **Smart Recommendations** (`DiscoveryService`): Suggests similar tracks from the local library based on style, mood, and era.
- **Telegram Caption Parsing** (`TelegramMetadataParser`): Extracts artist, album, year, genre, and Bandcamp URLs from unstructured captions.

## 4. Configuration

### Environment Variables
- `OPENROUTER_API_KEY`: Your OpenRouter secret key.
- `OPENROUTER_MODEL`: (Optional) Model ID override.

### Database Settings (Admin → Integrations)
- `openrouter_api_key`: Configured directly in Admin → Integrations.
- `openrouter_model`: Free-text model ID with quick presets.

## 5. Model Context Protocol (MCP)

TuneCamp can also act as an MCP server for external AI clients (Claude Desktop, custom agents). See [mcp-setup-guide.md](./mcp-setup-guide.md).
