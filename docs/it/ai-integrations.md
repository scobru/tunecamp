# Integrazioni IA (Intelligenza Artificiale)

TuneCamp utilizza **OpenRouter** per alimentare un **AI Library Assistant** conversazionale con tool calling, raccomandazioni musicali intelligenti e parsing automatico delle didascalie su Telegram.

## 1. Provider: OpenRouter

- **Servizio**: `src/server/modules/ai/openrouter.service.ts`
- **Modello Predefinito**: Configurabile tramite `OPENROUTER_MODEL` oppure `openrouter_model` in **Admin → Integrations** (predefinito `openrouter/free`).
- **Consiglio**: Seleziona un modello con supporto al *tool calling* (come `google/gemini-2.5-flash`, `openai/gpt-4o-mini` o `anthropic/claude-sonnet-4`) per ottenere i risultati migliori con l'assistente.

## 2. AI Library Assistant

- **Servizio**: `src/server/modules/ai/assistant.service.ts`
- **API**: `GET /api/ai/status`, `POST /api/ai/chat`, `POST /api/ai/apply`
- **Dove si trova nella UI**:
  - **Admin → Maintenance**: Box interattivo integrato accanto alle 4 operazioni di sistema (`Rescan Library`, `Sync Tags`, `Pre-warm Cache`, `Optimize DB`).
  - **My Catalog → Tracks / Albums** e **Album Details**: Pulsante contestuale **Ask AI** che passa automaticamente come contesto le tracce selezionate/filtrate o l'album aperto.

### Flusso Tool-Calling e Anteprima prima di Applicare

Al posto di maschere rigide campo per campo, l'assistente usa gli strumenti interni di TuneCamp e i provider esterni:

1. **Ispezione libreria**: `search_library`, `get_album_details`, `list_missing_metadata` (incluso `generic_titles` per individuare titoli generici come `AudioTrack 01..`), e `get_library_stats`.
2. **Ricerca esterna**: `search_external_releases`, `get_external_release_tracklist` (recupera le tracklist ufficiali con numero traccia e durata da iTunes, MusicBrainz e Discogs), `search_external_recordings` e `search_external_artists`.
3. **Proposta con diff**: `propose_track_updates`, `propose_album_update`, `propose_artist_update` e `propose_system_action` (solo admin).
4. **Conferma e Applicazione**: Le modifiche non vengono mai salvate automaticamente sul database. L'assistente mostra un'anteprima `prima → dopo` selezionabile; cliccando **Apply Selected** le modifiche vengono applicate tramite `CatalogService` sincronizzando anche i tag dei file audio.

## 3. Altre Funzionalità IA

- **Raccomandazioni Intelligenti** (`DiscoveryService`): Suggerisce tracce simili nella libreria locale in base a stile, atmosfera ed epoca.
- **Parsing Didascalie Telegram** (`TelegramMetadataParser`): Estrae artista, album, anno, genere e URL di Bandcamp da messaggi non strutturati.

## 4. Configurazione

### Variabili d'Ambiente
- `OPENROUTER_API_KEY`: La tua chiave segreta di OpenRouter.
- `OPENROUTER_MODEL`: (Opzionale) ID del modello da utilizzare.

### Impostazioni nel Database (Admin → Integrations)
- `openrouter_api_key`: Configurabile direttamente dal pannello Admin → Integrations.
- `openrouter_model`: Campo libero con preset consigliati.

## 5. Model Context Protocol (MCP)

TuneCamp può fungere anche da server MCP per client IA esterni (Claude Desktop, agenti personalizzati). Consulta la guida [mcp-setup-guide.md](../mcp-setup-guide.md).
