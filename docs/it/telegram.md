# Integrazione con il Bot Telegram

TuneCamp include un bot Telegram integrato che consente l'acquisizione rapida di file musicali, l'estrazione dei metadati e la gestione remota.

## Configurazione

1. **Crea un Bot**: Contatta [@BotFather](https://t.me/BotFather) su Telegram per ottenere un token API.
2. **Configurazione dell'Istanza**: Imposta la variabile d'ambiente `TUNECAMP_TELEGRAM_BOT_TOKEN`.
3. **Permessi**: Gli amministratori possono utilizzare il comando `/admin` per autorizzare utenti o canali specifici.

## Funzionalità

### 1. Acquisizione Massiva (Batch Ingestion)
Invia file audio, documenti o foto direttamente al bot.
* **Scansione Automatica**: Il bot estrae in automatico tag ID3, nomi degli artisti e titoli degli album.
* **Superamento dei Limiti di Frequenza**: I file multimediali vengono elaborati senza tempi di attesa (cooldown), consentendo caricamenti massivi ad alta velocità.
* **Modalità Silenziosa (Quiet Mode)**: Di default, il bot rimane in silenzio durante il caricamento per evitare di superare i limiti di frequenza delle API di Telegram. I caricamenti riusciti vengono confermati alla fine.
* **Modalità Debug**: Usa `/debug on` per visualizzare i log di elaborazione dettagliati (utile per risolvere problemi nell'estrazione dei metadati).

### 2. Suggerimenti per Metadati e Analisi IA
Il bot gestisce i metadati dei brani in modo intelligente:
* **Hashtag**: Utilizza hashtag specifici nella didascalia per forzare i metadati: `#artist Nome`, `#album Titolo`, `#year 2024`, `#title Traccia`, `#genre Elettronica`.
* **Estrazione tramite IA**: Se non vengono trovati hashtag ma è presente una didascalia di testo, il bot utilizza l'**IA (tramite OpenRouter)** per estrarre automaticamente l'artista, l'album e il titolo analizzando il testo in linguaggio naturale.
* **Integrazione Bandcamp**: Se il bot rileva un URL Bandcamp nella didascalia, scansionerà in automatico la pagina web per estrarre metadati di alta qualità, inclusi l'anno di pubblicazione e l'associazione corretta di artista e album.

### 3. Ricerca Remota e Streaming
Cerca la tua libreria direttamente da Telegram utilizzando i comandi:
* `/search <chiave>`: Trova brani nella libreria. **Nota**: Gli utenti autorizzati (tramite `/admin`) possono cercare tra tutti i brani (inclusi quelli privati e in bozza). Gli utenti non autorizzati possono cercare solo tra le tracce pubbliche.
* `/play <chiave>`: Ottieni un link per riprodurre in streaming una traccia specifica.

## Amministrazione

* **Amministratore Principale**: Le tracce caricate tramite Telegram vengono assegnate automaticamente all'amministratore principale dell'istanza (Root Admin o Super User).
* **Correzione Proprietà**: Se il bot viene utilizzato all'interno di un canale con più amministratori, il sistema esegue una normalizzazione automatica della proprietà durante la manutenzione all'avvio.
