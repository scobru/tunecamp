# Integrazioni IA (Intelligenza Artificiale)

TuneCamp sfrutta l'Intelligenza Artificiale per automatizzare l'arricchimento dei metadati, migliorare le raccomandazioni e semplificare l'acquisizione dei contenuti.

## 1. Provider: OpenRouter

Il motore IA principale è **OpenRouter**, che fornisce un accesso unificato tramite API a molteplici modelli LLM (Large Language Models).

- **Servizio**: `src/server/modules/ai/openrouter.service.ts`
- **Modello Predefinito**: Configurabile tramite `openrouter_model` (di default fa riferimento ai modelli gratuiti di OpenRouter come `meta-llama/llama-3-8b-instruct:free`).

## 2. Funzionalità Chiave

### Arricchimento dei Metadati
- **Scopo**: Compila automaticamente i dettagli mancanti per tracce e album.
- **Dati Estratti**: Genere, Anno di Pubblicazione, Mood (atmosfera), Tag di Stile e brevi descrizioni.
- **Flusso**: Quando un nuovo elemento viene scansionato o arricchito manualmente, il sistema invia il titolo e l'artista all'IA per "indovinare" o fornire i metadati canonici.

### Acquisizione Intelligente dei Contenuti (Telegram)
- **Scopo**: Analizza testi o didascalie disordinate per estrarre dati strutturati.
- **Funzionamento**: Quando un file audio viene inviato al bot Telegram con una didascalia, l'IA estrae l'Artista, l'Album, l'Anno e rileva persino eventuali **URL di Bandcamp** per avviare il recupero dei dati relativi.

### Raccomandazioni Intelligenti
- **Scopo**: Suggerisce "Tracce Simili" in base alle caratteristiche musicali piuttosto che a semplici tag.
- **Meccanismo**: Il sistema fornisce all'IA un elenco di tracce "candidate" presenti nella libreria locale. L'IA analizza lo stile, l'atmosfera e l'epoca per restituire le prime 5 raccomandazioni più pertinenti.

### Identificazione di Artisti e Album
- **Scopo**: Aiuta a confermare l'identità degli artisti confrontando i dati con database esterni come MusicBrainz.
- **Funzionamento**: L'IA genera "query di ricerca raffinate" e brevi biografie per aiutare il server a trovare la corrispondenza esatta nei database musicali globali.

## 3. Configurazione

Per abilitare le funzionalità IA, è necessario configurare una chiave API di OpenRouter.

### Variabili d'Ambiente
- `OPENROUTER_API_KEY`: La tua chiave segreta di OpenRouter.
- `OPENROUTER_MODEL`: (Opzionale) L'ID del modello specifico da utilizzare.

### Impostazioni nel Database (Pannello Amministratore)
- `openrouter_api_key`: Può essere inserita direttamente nella dashboard di amministrazione.
- `openrouter_model`: Può essere sovrascritto per singola istanza.

## 4. Ottimizzazione e Costi

Per mantenere i costi bassi (o azzerati):
1. **Modelli Gratuiti**: TuneCamp è ottimizzato per funzionare con i modelli del piano gratuito di OpenRouter.
2. **Cache Aggressiva**: Le risposte dell'IA vengono memorizzate nella cache del database SQLite. Il sistema non interroga mai due volte l'IA per lo stesso brano/artista.
3. **Attivazione Selettiva**: L'arricchimento tramite IA viene solitamente avviato da azioni esplicite dell'amministratore o durante la fase iniziale di acquisizione dei file, non per ogni singola richiesta dell'utente.

## 5. Model Context Protocol (MCP)

TuneCamp può fungere da server MCP, consentendo a client IA esterni (come Claude Desktop o agenti personalizzati) di interrogare e controllare la tua istanza TuneCamp.
Per istruzioni dettagliate sulla generazione delle chiavi API e sulla configurazione del tuo client IA, consulta la guida al [Protocollo MCP](./mcp-setup-guide.md).
