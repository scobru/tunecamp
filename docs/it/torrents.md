# Sistema Torrent

TuneCamp integra **WebTorrent** per consentire agli amministratori di scaricare musica tramite magnet link e importarla automaticamente nella libreria.

## 1. Architettura

Il sistema è un plugin autonomo in `src/server/plugins/torrent/`, gestito dal servizio `TorrentService` (`service.ts`, con un wrapper `DownloadProvider` in `provider.ts`), che racchiude un'istanza del client WebTorrent.

> **Nessuna ricerca integrata.** La funzionalità di ricerca sui tracker pubblici all'interno del server è stata rimossa: si basava sul collegamento a ThePirateBay/`apibay.org`, che è bloccato a livello di ISP in molte nazioni (es. in Italia tramite provvedimenti AGCOM). Di conseguenza, restituiva silenziosamente zero risultati. La scheda Ricerca Contenuto → WebTorrent ora rimanda a motori di ricerca torrent esterni; l'utente copia il magnet link e lo incolla nella casella "Aggiungi magnet", che viene scaricato tramite WebTorrent in modo indipendente da qualsiasi host bloccato.

> **Attivazione esplicita (Opt-in):** Come per Soulseek, il plugin torrent è disabilitato di default per motivi legali e deve essere abilitato esplicitamente dal pannello di amministrazione.

### Componenti Chiave
- **Client WebTorrent**: Gestisce il protocollo di download peer-to-peer.
- **Persistenza in SQLite**: I metadati dei torrent (infoHash, URI magnet, stato) vengono memorizzati nel database per consentire il ripristino dei download dopo il riavvio del server.
- **Integrazione con lo Scansore Automatico**: Una volta completato il download di un torrent, il servizio avvia automaticamente lo `Scanner` per elaborare i file audio rilevati e aggiungerli al catalogo di TuneCamp.

## 2. Struttura delle Cartelle

I torrent vengono scaricati in una cartella dedicata per evitare che lo scanner principale della libreria rilevi file incompleti:
- **Download**: `music/downloads/torrents/`
- **Seed**: `music/.torrent-seeds/` — lo store che WebTorrent usa quando effettua il *seeding* dei file della libreria. Ha un nome che inizia con un punto, così lo scanner del catalogo e il watcher lo ignorano (saltano le cartelle nascoste), e si trova sotto `musicDir` per condividere il volume persistente. Passare esplicitamente questo `path` è ciò che impedisce a WebTorrent di ricadere sul suo store predefinito `os.tmpdir()/webtorrent` — la causa della storica crescita incontrollata di `/tmp/webtorrent` (vedi la voce di changelog 2.17.3). All'avvio `TorrentService` rimuove eventuali residui del vecchio store `/tmp/webtorrent`.

## 3. Rotte API

Le rotte riservate agli amministratori sono disponibili sotto `/api/admin/torrents`:

- **`GET /`**: Restituisce un elenco di tutti i torrent (attivi e memorizzati nel database) con il relativo avanzamento, velocità e lista dei file.
- **`POST /add`**: Aggiunge un nuovo magnet link alla coda di download.
- **`DELETE /:infoHash`**: Rimuove un torrent. Il parametro di query opzionale `?deleteFiles=true` eliminerà anche i dati scaricati dal disco.

## 4. Flusso di Automazione

1. **Aggiunta**: L'amministratore inserisce un URI magnet.
2. **Metadati**: Il client recupera i metadati del torrent (nome, elenco dei file).
3. **Download**: I file vengono scaricati nella cartella dei torrent.
4. **Completamento**: Al raggiungimento del 100%, viene attivato l'evento `done`.
5. **Importazione**: Il servizio esamina i file. Qualsiasi file con estensione audio valida (`.mp3`, `.flac`, ecc.) viene passato a `scanner.processAudioFile`.
6. **Aggiornamento Libreria**: Lo scanner sposta/copia il file nella libreria e aggiorna il database.

## 5. Trovare i Torrent

La ricerca integrata nell'applicazione è stata rimossa (vedi nota al paragrafo 1). La scheda WebTorrent nella sezione di Ricerca Contenuti mostra invece un elenco di motori di ricerca esterni (BTDigg, 1337x, Knaben, Solid Torrents e un elenco di proxy di ThePirateBay) che si aprono in una nuova scheda, precompilati con la chiave di ricerca inserita. Trova la release sul sito esterno, copia il suo magnet link e incollalo nella casella "Aggiungi magnet" per avviare il download.
