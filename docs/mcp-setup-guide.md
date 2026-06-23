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
