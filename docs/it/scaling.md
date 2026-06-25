# Scalabilità e Limiti di Concorrenza

TuneCamp viene eseguito come un singolo processo Node.js con SQLite. Si tratta di una scelta progettuale precisa: ridurre al minimo la gestione operativa per un singolo artista o una piccola etichetta, accettando in cambio dei limiti intrinseci che è bene conoscere prima di convogliare traffico reale sul server. Questa pagina documenta dove si collocano effettivamente tali limiti.

## Come le Scritture vengono Escluse dal Percorso Critico

L'architettura isola già le operazioni più onerose dal punto di vista computazionale:

| Tipo di Attività | Dove viene Eseguita | Limite di Concorrenza |
|---|---|---|
| Analisi dei metadati audio (scansione/importazione) | Pool di thread worker (`src/server/modules/workers/`) | 4 thread worker |
| Calcolo dell'hash dei file | Thread principale, ma tramite "fast hash" (primo e ultimo megabyte, MD5) — meno di un millisecondo per file | Semaforo nel modulo di scansione |
| Generazione delle forme d'onda (waveform) | Coda dedicata → processo figlio FFmpeg | Coda separata |
| Conversione da WAV a MP3 | Coda dedicata → processo figlio FFmpeg | Dinamico, pari a `min(core_disponibili − 1, 4)` |
| Codifica HLS in tempo reale | Un processo figlio FFmpeg per ogni trasmissione attiva | Uno per stanza/canale |
| Scritture in SQLite | Thread principale, sincrone (better-sqlite3) | Singolo scrittore (writer) |

Il database SQLite viene eseguito con le opzioni `journal_mode=WAL`, `synchronous=NORMAL` e `busy_timeout=5000` (impostate in `src/server/core/database.ts`). La modalità WAL (Write-Ahead Logging) garantisce che le operazioni di lettura non vengano mai bloccate da quelle di scrittura; l'opzione NORMAL rimuove l'operazione di fsync per ogni singolo commit (il punto di controllo WAL esegue comunque la sincronizzazione), per cui le importazioni massive con migliaia di piccole scritture si comportano come transazioni raggruppate senza dover ristrutturare il modulo di scansione. Questa scelta comporta un compromesso documentato e voluto: un'improvvisa interruzione di corrente può far perdere gli ultimi commit effettuati, ma non corromperà mai il database.

## Limiti Pratici

**Letture (streaming, navigazione, API)**: Sostanzialmente limitate solo dalla larghezza di banda disponibile e dalle transcodifiche FFmpeg, non dal database SQLite. Centinaia di ascoltatori simultanei che riproducono file già transcodificati non rappresentano un problema anche su un VPS di piccole dimensioni.

**Scritture**: La libreria `better-sqlite3` esegue le scritture in modo sincrono sul thread principale. Le singole scritture richiedono pochi microsecondi sotto la modalità WAL, per cui il normale utilizzo (acquisti, commenti, contatori di ascolto) non risente di alcun rallentamento. La situazione che può creare criticità è una **scansione massiva eseguita in concomitanza con picchi di traffico**: una scansione di 10.000 tracce esegue decine di migliaia di piccole scritture intervallate con l'analisi dei metadati. L'analisi avviene fuori dal thread principale, ma le scritture no. È consigliabile programmare le importazioni di grandi dimensioni negli orari di minor afflusso.

**Utenti simultanei**: Come regola generale, un VPS con 2 vCPU e 2 GB di RAM gestisce comodamente una piccola etichetta — ad esempio fino a una decina di artisti che caricano musica occasionalmente e qualche centinaio di ascoltatori. Il primo collo di bottiglia che si riscontrerà sarà il **consumo di CPU dovuto alla transcodifica in tempo reale** (limitata a 4 processi FFmpeg simultanei; le ulteriori richieste vengono messe in coda), non il database.

**Cosa non è scalabile**: L'esecuzione di più processi TuneCamp che puntano allo stesso file SQLite. Il design a singolo scrittore presuppone la presenza di un solo processo attivo.

## Superare i Limiti di una Singola Istanza: Scalare tramite Federazione

Se una singola istanza raggiunge realmente i propri limiti prestazionali, la soluzione coerente con l'architettura di TuneCamp non è l'adozione di un database più grande, bensì l'**avvio di più istanze**. È possibile suddividere il catalogo per etichette, collettivi o gruppi di artisti: ogni istanza gestirà il proprio file SQLite e il proprio budget di risorse FFmpeg, mentre il catalogo federato (scoperta basata su gossip + endpoint `/api/catalog`) si occuperà di presentarle agli ascoltatori come un'unica rete coesa. Questo è il modello di scalabilità previsto ed è il motivo per cui l'integrazione di PostgreSQL è volutamente esclusa dal progetto: comporterebbe un raddoppio del carico di manutenzione dello schema per risolvere un problema che la federazione risolve già in modo nativo, sacrificando la semplicità a "zero operazioni di gestione" che rappresenta il principale vantaggio di TuneCamp rispetto a Funkwhale.

## Se si riscontrano Rallentamenti

1. **Uso della CPU per Transcodifica**: I file caricati in formati lossless (.wav e .flac) vengono pre-transcodificati in MP3 a 320kbps al momento dell'importazione, in modo che lo streaming avvenga servendo file statici. Una nuova scansione della libreria (rescan) corregge le vecchie librerie per le quali non erano stati generati i file MP3. Per gli altri casi di transcodifica al volo (seek, riduzione del bitrate), aumenta il valore di `transcodeCacheMaxBytes` per salvare in cache i risultati delle transcodifiche.
2. **Conflitti in fase di Importazione**: Imposta la variabile `scheduledScanHour` (valore da 0 a 23, ora del server) per eseguire la scansione giornaliera automatica nelle ore notturne; questa condivide un blocco di attività con la scansione manuale per evitare che si sovrappongano.
3. **Larghezza di Banda**: Posiziona l'istanza dietro una rete CDN o abilita l'opzione `xaccelRedirect` (il supporto alla direttiva `X-Accel-Redirect` di Nginx è integrato, vedi la guida a [NGINX](./NGINX.md)).

## Durabilità: Replica Continua di SQLite con Litestream

I backup notturni (`src/tools/backup.ts`) limitano la perdita potenziale di dati a un massimo di un giorno. Per una piattaforma di vendita, la soluzione migliore è l'uso di [Litestream](https://litestream.io/): questo strumento legge in tempo reale il file WAL di SQLite e trasmette ogni modifica a servizi di archiviazione S3/Backblaze B2, offrendo punti di ripristino con scarto di secondi senza richiedere alcuna modifica al codice di TuneCamp — viene eseguito come processo secondario (sidecar) che monitora il file del database.

Una configurazione minima per Docker Compose:

```yaml
litestream:
  image: litestream/litestream
  command: replicate /data/tunecamp.db s3://tuo-bucket/tunecamp
  volumes:
    - ./data:/data
  environment:
    - LITESTREAM_ACCESS_KEY_ID=...
    - LITESTREAM_SECRET_ACCESS_KEY=...
```

Per effettuare il ripristino: `litestream restore -o /data/tunecamp.db s3://tuo-bucket/tunecamp`. Nota: Litestream effettua la replica del solo database — le copertine e i file audio devono comunque essere salvati tramite il normale strumento di backup o archiviati su object storage.
