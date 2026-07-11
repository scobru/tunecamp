# Integrazione del Server MCP in TuneCamp

TuneCamp implementa il protocollo **Model Context Protocol (MCP)**, consentendo ai client IA (come Claude Desktop) di connettersi, effettuare ricerche nel tuo catalogo musicale, avviare la scansione dei file e controllare le statistiche del server.

Poiché la maggior parte dei client IA (incluso Claude Desktop) supporta nativamente solo connessioni locali via `stdio` (standard input/output), TuneCamp fornisce sia un server protetto **SSE (Server-Sent Events)** sia un'utilità di **bridge locale** affinché i due sistemi possano comunicare tra loro in modo sicuro.

---

## 1. Genera un API Token

Tutte le richieste MCP sono protette. Per poterti connettere, devi prima creare un token:
1. Accedi a TuneCamp con il tuo account amministratore o curatore.
2. Vai su **Profile Settings** -> sezione **API Tokens**.
3. Fai clic su **Create New Token**, inserisci un nome (es. "Claude Desktop") e conferma.
4. Copia il token generato (inizia con `tc_`). *Nota: non potrai più visualizzarlo per intero dopo la creazione.*

---

## 2. Configura Claude Desktop

Apri il file di configurazione di Claude Desktop (`claude_desktop_config.json`):
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Aggiungi il server `tunecamp` all'interno della sezione `mcpServers`. Assicurati di indicare la cartella in cui è installato TuneCamp (sostituisci il percorso assoluto e il token `tc_...` con i tuoi):

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

*Nota: prima di avviare il bridge, assicurati di aver compilato il progetto TuneCamp in modo che il file `mcp-bridge.js` sia presente nella cartella `dist/`:*
```bash
npm run build
```

---

## 3. Strumenti Esportati e Disponibili

Una volta effettuata la connessione, il tuo chatbot IA avrà accesso ai seguenti strumenti:

### `search_music`
- **Descrizione**: Cerca artisti, album e tracce nella libreria locale.
- **Parametri**:
  - `query` (stringa, richiesto): Testo da cercare.

### `list_recent_albums`
- **Descrizione**: Mostra gli album aggiunti più di recente nella libreria di TuneCamp.
- **Parametri**:
  - `limit` (intero, opzionale): Numero massimo di album (default 20, max 100).

### `scan_library`
- **Descrizione**: Avvia una scansione asincrona in background della cartella musicale del server per rilevare nuovi file audio o aggiornamenti.

### `get_system_stats`
- **Descrizione**: Restituisce statistiche generali sull'istanza TuneCamp (numero di artisti, album totali, tracce e spazio totale su disco utilizzato).

---

## 4. Aggiunta di un nuovo strumento MCP (per sviluppatori)

Gli strumenti sono definiti direttamente all'interno del server MCP, in un unico file: [`src/server/routes/api/mcp.ts`](../../src/server/routes/api/mcp.ts).

L'aggiunta di uno strumento richiede **due modifiche** nello stesso file, seguite da una ricompilazione del progetto.

### Passaggio 1 — Dichiarazione dello strumento (handler `ListTools`)

Aggiungi un elemento all'array `tools` restituito dall'handler `ListToolsRequestSchema`. In questa fase, il client IA scopre lo strumento e il relativo schema di input (JSON Schema):

```typescript
{
    name: "get_artist_releases",
    description: "Elenca tutte le pubblicazioni di un determinato artista.",
    inputSchema: {
        type: "object",
        properties: {
            artist: { type: "string", description: "Nome o slug dell'artista" }
        },
        required: ["artist"]
    }
}
```

### Passaggio 2 — Implementazione dello strumento (handler `CallTool`)

Aggiungi un blocco `case` all'interno dell'istruzione `switch (name)` nell'handler `CallToolRequestSchema`. Il valore di `name` deve corrispondere esattamente a quello inserito al Passaggio 1. I servizi dell'istanza sono già accessibili tramite il parametro `container` destrutturato all'inizio della funzione (`library`, `database`, `scannerService`, `config`):

```typescript
case "get_artist_releases": {
    const artist = String(args?.artist || "").trim();
    if (!artist) {
        throw new McpError(ErrorCode.InvalidParams, "il parametro artist è richiesto");
    }
    const rows = database.db.prepare(`
        SELECT a.title, a.year FROM albums a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        WHERE ar.name LIKE ? OR ar.slug = ?
        ORDER BY a.year DESC
    `).all(`%${artist}%`, artist);

    const text = rows.length
        ? rows.map((r: any) => `- ${r.title} (${r.year || "N/A"})`).join("\n")
        : "Nessuna pubblicazione trovata.";

    // Ogni strumento deve restituire { content: [{ type: "text", text }] }
    return { content: [{ type: "text", text }] };
}
```

**Regole importanti:**
- Restituisci **sempre** l'oggetto `{ content: [{ type: "text", text }] }`. Per segnalare un errore "soft", aggiungi il flag `isError: true`; per un errore di convalida o di parametri, lancia un'eccezione `McpError` (`ErrorCode.InvalidParams`, `MethodNotFound`, ecc.).
- Per le query di lettura, usa `library.search(...)` (che rispetta la visibilità dei contenuti — vedi `VisibilityProfile`) o query SQL dirette tramite `database.db.prepare(...)`.
- Per attività onerose o asincrone **non bloccare il processo**: avviarle tramite `taskManager.run("task-id", fn)` e restituire immediatamente un messaggio di conferma (vedi `scan_library` come esempio), così che l'IA non debba attendere il completamento della scansione.
- Tutte le rotte MCP sono protette dal token `tc_...`; non è necessario aggiungere controlli di autenticazione all'interno dei singoli strumenti.

### Passaggio 3 — Compilazione e riavvio

```bash
npm run build   # rigenera la cartella dist/, incluso il bridge mcp-bridge.js
```

Riavvia l'istanza di TuneCamp e riavvia il client (Claude Desktop) per ricaricare l'elenco degli strumenti aggiornati.
