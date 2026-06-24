# Guida all'integrazione del Server MCP in TuneCamp

TuneCamp implementa il **Model Context Protocol (MCP)**, consentendo a client AI (come Claude Desktop) di connettersi, effettuare ricerche nel tuo catalogo musicale, avviare scansioni dei file e verificare le statistiche del server.

Poiché la maggior parte dei client AI (incluso Claude Desktop) supporta nativamente solo connessioni locali via `stdio` (standard input/output), TuneCamp fornisce sia un server **SSE (Server-Sent Events)** protetto sia un'utility di **bridge locale** per far dialogare i due sistemi in totale sicurezza.

---

## 1. Generare un API Token

Tutte le richieste MCP sono protette. Per connetterti, devi prima creare un token:
1. Accedi a TuneCamp con il tuo account amministratore o curatore.
2. Vai su **Profile Settings** -> sezione **API Tokens**.
3. Clicca su **Create New Token**, inserisci un nome (es. "Claude Desktop") e conferma.
4. Copia il token generato (inizia con `tc_`). *Nota: non potrai visualizzarlo di nuovo per intero dopo la creazione.*

---

## 2. Configurare Claude Desktop

Apri il file di configurazione di Claude Desktop (`claude_desktop_config.json`):
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Aggiungi il server `tunecamp` nella sezione `mcpServers`. Assicurati di puntare alla cartella in cui è installato TuneCamp (sostituisci il percorso assoluto e il token `tc_...` con i tuoi):

```json
{
  "mcpServers": {
    "tunecamp": {
      "command": "node",
      "args": [
        "d:/shogun-2/tunecamp/dist/server/tools/mcp-bridge.js",
        "http://localhost:1970/api/mcp/sse",
        "tc_il_tuo_token_qui"
      ]
    }
  }
}
```

*Nota: prima di avviare il bridge, assicurati di aver compilato il progetto TuneCamp in modo che il file `mcp-bridge.js` esista nella cartella `dist/`:*
```bash
npm run build
```

---

## 3. Tool Esportati e Disponibili

Una volta connesso, il tuo chatbot AI avrà accesso ai seguenti tool:

### `search_music`
- **Descrizione**: Cerca artisti, album e tracce nella libreria locale.
- **Parametri**:
  - `query` (string, richiesto): Testo da cercare.

### `list_recent_albums`
- **Descrizione**: Mostra gli ultimi album aggiunti alla libreria di TuneCamp.
- **Parametri**:
  - `limit` (integer, opzionale): Numero massimo di album (default 20, max 100).

### `scan_library`
- **Descrizione**: Avvia una scansione asincrona in background della directory musicale del server per rilevare nuovi file audio o aggiornamenti.

### `get_system_stats`
- **Descrizione**: Restituisce statistiche globali sull'istanza TuneCamp (numero di artisti, album totali, tracce e spazio disco totale utilizzato).

---

## 4. Aggiungere un nuovo Tool MCP (per sviluppatori)

I tool non sono caricati da una cartella esterna come i [plugin provider](./PLUGINS.md): sono definiti direttamente nel server MCP, in un unico file: [`src/server/routes/api/mcp.ts`](../src/server/routes/api/mcp.ts).

Aggiungere un tool richiede **due modifiche** nello stesso file, più una ricompilazione.

### Passo 1 — Dichiarare il tool (handler `ListTools`)

Aggiungi una voce all'array `tools` restituito dall'handler `ListToolsRequestSchema`. È qui che il client AI scopre il tool e il suo schema di input (JSON Schema):

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

### Passo 2 — Implementare il tool (handler `CallTool`)

Aggiungi un `case` allo `switch (name)` dentro l'handler `CallToolRequestSchema`. Il `name` deve combaciare esattamente con quello del Passo 1. I servizi dell'istanza sono già disponibili tramite il `container` destrutturato in cima alla funzione (`library`, `database`, `scannerService`, `config`):

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

    // Tutti i tool devono restituire { content: [{ type: "text", text }] }
    return { content: [{ type: "text", text }] };
}
```

**Regole importanti:**
- Restituisci **sempre** `{ content: [{ type: "text", text }] }`. Per segnalare un errore "morbido" aggiungi `isError: true`; per un errore di validazione/parametri lancia un `McpError` (`ErrorCode.InvalidParams`, `MethodNotFound`, ecc.).
- Per query in lettura usa `library.search(...)` (rispetta la visibilità — vedi `VisibilityProfile`) o SQL diretto via `database.db.prepare(...)`.
- Per lavoro pesante/asincrono **non bloccare**: avvialo con `taskManager.run("task-id", fn)` e ritorna subito un messaggio (vedi `scan_library` come esempio), così l'AI non resta in attesa.
- Tutte le rotte MCP sono già protette dal token `tc_...`; non serve aggiungere auth nel singolo tool.

### Passo 3 — Ricompilare e riavviare

```bash
npm run build   # rigenera dist/, incluso il bridge mcp-bridge.js
```

Riavvia l'istanza TuneCamp e riavvia il client (Claude Desktop) per ricaricare la lista tool.
