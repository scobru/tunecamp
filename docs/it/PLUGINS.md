# Sistema di Plugin di TuneCamp

TuneCamp utilizza un'architettura modulare basata su provider ispirata a progetti come **Nuclear**. Questo consente agli sviluppatori di estendere le funzionalità della piattaforma senza modificare il codice sorgente principale.

## Panoramica

Ci sono 8 tipi di provider che puoi implementare. Tutti vengono rilevati automaticamente all'avvio controllando i metodi che la tua classe espone (duck-typing):

1.  **MetadataProvider** — nuove fonti per le informazioni su tracce/album (es. MusicBrainz, Discogs). Rilevato da: `searchRelease`.
2.  **StreamingProvider** — sorgenti audio esterne di fallback (es. YouTube, Bandcamp). Rilevato da: `getStreamUrl`.
3.  **DownloadProvider** — nuove modalità per acquisire musica (es. Soulseek, BitTorrent). Rilevato da: `search` + `download` + `isAvailable`.
4.  **ScannerProvider** — nuove sorgenti per la libreria (es. IPFS, S3). Rilevato da: `scan`.
5.  **StorageProvider** — backend di caricamento (es. Google Drive, Dropbox). Rilevato da: `upload` + `getUrl`.
6.  **PlaylistProvider** — importazione di playlist esterne (es. Deezer, YouTube Music). Rilevato da: `canHandlePlaylist` + `fetchPlaylistByUrl`.
7.  **ScrobbleProvider** — esportazione della cronologia di ascolto (es. Last.fm, ListenBrainz). Rilevato da: `scrobble` + `isConfigured`.
8.  **AIProvider** — backend LLM per l'arricchimento dei metadati (es. Ollama, OpenAI). Rilevato da: `enrichMetadata` + `complete`.

> **Nota:** La federazione ActivityPub e il Peer Sharing P2P sono gestiti internamente dai moduli principali della piattaforma e non sono esposti come tipi di plugin esterni.

---

## Creazione di un Plugin

Per creare un plugin, crea semplicemente un file `.js` (ESM) nella directory `plugins/` della tua installazione di TuneCamp.

### Esempio: Provider di Metadati Personalizzato

```javascript
// plugins/my-custom-metadata.js

export default class MyCustomMetadataProvider {
    constructor() {
        this.id = 'my-custom-source';
        this.name = 'My Custom Source';
        this.version = '1.0.0';
        this.description = 'Recupera metadati dalla mia API privata';
    }

    async isAvailable() {
        return true; 
    }

    // `searchRelease` è il metodo che il loader verifica tramite duck-typing per registrare un
    // MetadataProvider — DEVE esistere, altrimenti il plugin viene ignorato.
    async searchRelease(query) {
        // Restituisce un array di oggetti MetadataResult (a livello di album/release)
        return [
            { id: 'rel-1', title: 'Album Title', artist: 'Artist Name', date: '2024-01-01', source: this.id }
        ];
    }

    async searchRecording(query) {
        // Restituisce un array di oggetti MetadataResult (a livello di traccia)
        return [
            { id: 'abc-123', title: 'Song Title', artist: 'Artist Name', date: '2024-01-01', source: this.id }
        ];
    }

    async getCoverUrl(id) {
        return 'https://example.com/cover.jpg';
    }
}
```

### Esempio: Provider di Streaming YouTube (utilizzando una libreria esterna)

Se il tuo plugin ha bisogno di dipendenze esterne, puoi installarle nella root di TuneCamp o pacchettizzare (bundle) il tuo plugin.

```javascript
import play from 'play-dl';

export default class MyYouTubeProvider {
    constructor() {
        this.id = 'custom-youtube';
        this.name = 'Custom YouTube';
        this.version = '1.0.0';
    }

    async getStreamUrl(title, artist) {
        const results = await play.search(`${artist} - ${title}`, { limit: 1 });
        if (results.length > 0) {
            const info = await play.video_info(results[0].url);
            return info.format.find(f => f.mimeType.includes('audio')).url;
        }
        return null;
    }
}
```

---

## Contratti dei Provider

Il caricatore (loader) effettua il duck-typing sui metodi elencati sopra sotto la voce **Rilevato da** — una classe viene registrata in *ogni* registro di cui implementa i metodi richiesti (quindi un singolo plugin può fungere, ad esempio, sia da `DownloadProvider` che da `StorageProvider`). Di seguito sono riportati i contratti completi dei metodi per ciascun tipo. I plugin sono scritti in JS semplice; le firme sono mostrate in TypeScript per maggiore chiarezza, tratte da [`src/server/core/provider.ts`](../../src/server/core/provider.ts).

Ogni provider contiene anche i campi base: `id`, `name`, `version`, `description?`, e gli hook opzionali `onEnable()` / `onDisable()` (vedi Hook del Ciclo di Vita sotto).

### 3. DownloadProvider

**Rilevato da:** `isAvailable` + `search` + `download`.

```typescript
interface DownloadResult {
    id: string;
    title: string;
    artist?: string;
    filename: string;
    sizeBytes: number;
    bitrate?: number;
    source: string;
    meta?: any;        // dati specifici del provider, passati a download()
}

isAvailable(): Promise<boolean>;            // la sorgente è connessa/raggiungibile?
search(query: string): Promise<DownloadResult[]>;   // es. "Artista - Titolo"
download(result: DownloadResult): Promise<string>;  // restituisce il percorso del file LOCALE
```

```javascript
// plugins/my-download.js
export default class MyDownloadProvider {
    id = 'my-dl'; name = 'My Downloader'; version = '1.0.0';
    async isAvailable() { return true; }
    async search(query) {
        return [{ id: 'x1', title: query, filename: 'x1.flac', sizeBytes: 0, source: this.id, meta: {} }];
    }
    async download(result) {
        const dest = `/tmp/${result.filename}`;
        // ...scarica i byte su `dest`...
        return dest;
    }
}
```

### 4. ScannerProvider

**Rilevato da:** `scan`.

```typescript
scan(): Promise<string[]>;                       // lista di percorsi/identificatori nella sorgente
getMetadata(path: string): Promise<any>;         // tag per una singola voce
getFileStream(path: string): Promise<NodeJS.ReadableStream>;  // stream leggibile per l'ingestione
```

```javascript
// plugins/s3-scanner.js
export default class S3Scanner {
    id = 's3'; name = 'S3 Scanner'; version = '1.0.0';
    async scan() { return ['bucket/track1.flac', 'bucket/track2.flac']; }
    async getMetadata(p) { return { title: p.split('/').pop() }; }
    async getFileStream(p) { /* restituisce un Readable */ }
}
```

### 5. StorageProvider

**Rilevato da:** `upload` + `getUrl`.

```typescript
upload(localPath: string, remotePath: string): Promise<string>;   // restituisce ref/chiave remota
download(remotePath: string, localPath: string): Promise<void>;
getUrl(remotePath: string): Promise<string | null>;               // URL pubblico/firmato
exists(remotePath: string): Promise<boolean>;
delete(remotePath: string): Promise<void>;
```

```javascript
// plugins/dropbox-storage.js
export default class DropboxStorage {
    id = 'dropbox'; name = 'Dropbox'; version = '1.0.0';
    async upload(localPath, remotePath) { /* carica */ return remotePath; }
    async download(remotePath, localPath) { /* scarica */ }
    async getUrl(remotePath) { return `https://dropbox.example/${remotePath}`; }
    async exists(remotePath) { return true; }
    async delete(remotePath) { /* elimina */ }
}
```

### 6. PlaylistProvider

**Rilevato da:** `canHandlePlaylist` + `fetchPlaylistByUrl`.

```typescript
interface PlaylistTrack { title: string; artist: string; album?: string; duration?: number; sourceId: string; provider: string; }
interface ExternalPlaylist { id: string; title: string; description?: string; thumbnail?: string; tracks: PlaylistTrack[]; }

canHandlePlaylist(url: string): boolean;                  // il provider può decodificare questo URL?
fetchPlaylistByUrl(url: string): Promise<ExternalPlaylist>;
```

```javascript
// plugins/deezer-playlist.js
export default class DeezerPlaylist {
    id = 'deezer-pl'; name = 'Deezer Playlists'; version = '1.0.0';
    canHandlePlaylist(url) { return url.includes('deezer.com/playlist'); }
    async fetchPlaylistByUrl(url) {
        return { id: 'pl1', title: 'My Playlist', tracks: [
            { title: 'Song', artist: 'Artist', sourceId: 's1', provider: this.id }
        ]};
    }
}
```

### 7. ScrobbleProvider

**Rilevato da:** `scrobble` + `isConfigured`.

```typescript
scrobble(track: { artist: string; title: string; album?: string; duration?: number }): Promise<void>;
nowPlaying?(track: { artist: string; title: string; album?: string }): Promise<void>;
isConfigured(): Promise<boolean>;        // credenziali presenti e pronte?
```

```javascript
// plugins/maloja-scrobble.js
export default class MalojaScrobble {
    id = 'maloja'; name = 'Maloja'; version = '1.0.0';
    async isConfigured() { return !!process.env.MALOJA_KEY; }
    async scrobble(track) { /* POST su Maloja */ }
    async nowPlaying(track) { /* opzionale */ }
}
```

### 8. AIProvider

**Rilevato da:** `enrichMetadata` + `complete`.

```typescript
enrichMetadata(context: { title: string; artist?: string; album?: string; genre?: string }):
    Promise<Partial<{ description: string; genre: string; tags: string[]; mood: string }>>;
complete(prompt: string): Promise<string | null>;
isAvailable(): Promise<boolean>;
```

```javascript
// plugins/ollama-ai.js
export default class OllamaAI {
    id = 'ollama'; name = 'Ollama (locale)'; version = '1.0.0';
    async isAvailable() { return true; }
    async complete(prompt) { /* chiama Ollama locale */ return 'response'; }
    async enrichMetadata(ctx) {
        return { description: `Una traccia di ${ctx.artist}`, tags: ['demo'] };
    }
}
```

---

## Come Funziona

1.  **Rilevamento**: All'avvio, TuneCamp esegue la scansione della cartella `plugins/`.
2.  **Registrazione**: Importa dinamicamente ciascun file e verifica quali metodi sono implementati.
3.  **Iniezione**: Il plugin viene registrato automaticamente nel servizio singleton corrispondente (es. `MetadataService`).
4.  **Esecuzione**: Quando un utente esegue un'azione (come la ricerca o lo streaming), TuneCamp esegue l'iterazione attraverso tutti i provider registrati in parallelo o in ordine di registrazione.

## Avanzato: Accesso ai Servizi Interni

Sebbene i plugin siano progettati per essere disaccoppiati, occasionalmente puoi accedere ai servizi interni tramite le esportazioni dei singleton se necessario (sebbene non sia consigliato per mantenere la massima portabilità).

```javascript
import { database } from '../dist/server/core/database.js'; // Usare con cautela
```

## Hook del Ciclo di Vita

Un provider può opzionalmente implementare `onEnable()` e `onDisable()`:

```javascript
async onEnable()  { /* apri connessioni, riscalda le cache, ecc. */ }
async onDisable() { /* pulisci le risorse */ }
```

Questi vengono eseguiti quando il plugin viene abilitato/disabilitato — al momento del caricamento (rispettando l'ultimo stato persistito) e ogni volta che un amministratore attiva o disattiva lo switch nel Pannello di Controllo. Un plugin disabilitato da un amministratore rimane disabilitato anche dopo i riavvii.

## Pannello di Controllo

Puoi vedere tutti i provider caricati, le loro versioni, lo stato di abilitazione e attivarli/disattivarli nella sezione **Pannello di Controllo → Integrazioni** dell'interfaccia web di TuneCamp (solo per l'amministratore root).

---

## Distribuzione Docker / Produzione

### Come sono inclusi i plugin nell'immagine

La directory `plugins/` viene copiata nell'immagine Docker di produzione in `/app/plugins`. La variabile d'ambiente `TUNECAMP_PLUGINS_DIR=/app/plugins` viene impostata automaticamente.

I plugin integrati (es. `demo-provider.js`) sono sempre presenti. I plugin personalizzati sopravvivono alle ricostruzioni dell'immagine tramite un volume Docker denominato.

### Aggiungere un plugin personalizzato con docker-compose

Il file `docker-compose.yml` predefinito monta un volume denominato in `/app/plugins`:

```yaml
volumes:
  - tunecamp_plugins:/app/plugins
```

Al primo avvio, Docker copia il contenuto di `plugins/` dell'immagine nel volume. Successivamente, puoi aggiungere il tuo plugin:

```bash
# Copia il file del tuo plugin all'interno del container in esecuzione
docker cp my-plugin.js tunecamp:/app/plugins/

# Riavvia per caricarlo
docker compose restart tunecamp
```

### Utilizzare invece una cartella locale

Per gestire i plugin come file sull'host (più comodo per lo sviluppo):

```yaml
# docker-compose.yml
volumes:
  - /percorso/della/tua/musica:/music
  - tunecamp_data:/data
  - ./plugins:/app/plugins   # ← bind mount su cartella host
```

Posiziona i file `.js` in `./plugins/` e riavvia il container.

### Verificare che i plugin siano caricati correttamente

```bash
docker compose logs tunecamp | grep -i plugin
```

Dovresti vedere righe simili a:
```
[PluginLoader] Loaded plugin: My Custom Source v1.0.0
```
