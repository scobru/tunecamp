# Comparazione: Funkwhale vs TuneCamp

Questo documento analizza in modo onesto e dettagliato le differenze tra **Funkwhale** e **TuneCamp**, due piattaforme musicali federate ma orientate a scopi, architetture e target di utenza differenti.

---

## Tabella Comparativa Rapida

| Caratteristica | Funkwhale | TuneCamp |
| :--- | :--- | :--- |
| **Destinazione d'Uso** | Condivisione comunitaria di musica e podcast | Autoproduzione e vendita per artisti/etichette |
| **Stack Backend** | Python (Django) + PostgreSQL + Redis | Node.js (TypeScript) + SQLite |
| **Stack Frontend** | Vue.js | React + Vite + Tailwind CSS / DaisyUI |
| **Modello di Federazione** | ActivityPub nativo (replica parziale delle librerie tra pod) | **Ibrido**: ActivityPub (sociale) + Zen Protocol (scoperta nodi) + HTTP REST |
| **Monetizzazione** | Assente | **Integrata**: NFT (ERC-1155 su Base) + Stripe (Fiat) |
| **Compatibilità Mobile** | Subsonic API | Subsonic / OpenSubsonic API |
| **Metodi di Ingestione** | Upload web, importazione locale, YouTube | Upload web, Bot Telegram, Soulseek, BitTorrent |
| **Funzionalità Social** | Commenti, preferiti, profili utente | Post Fediverse, Chat integrata, Live Stream P2P |
| **Difficoltà di Gestione** | Media/Alta (più servizi in esecuzione) | Bassa (singolo processo Node o Docker Compose leggero) |

---

## Analisi Dettagliata delle Differenze

### 1. Filosofia e Target di Utenza
* **Funkwhale** nasce con la visione di un "SoundCloud/Spotify decentralizzato" per la community del Fediverse. È ideale per collettivi, appassionati di musica libera, creatori di podcast e utenti che desiderano ascoltare musica in streaming condividendo le proprie librerie con altri appassionati.
* **TuneCamp** è progettato specificamente come un'alternativa decentralizzata e self-hosted a **Bandcamp**. L'obiettivo principale è mettere l'indipendenza finanziaria dell'artista al centro, offrendo gallerie e profili personalizzati e gestiti dall'artista stesso, senza intermediari o algoritmi centralizzati.

### 2. Architettura e Semplicità di Hosting
* **Funkwhale** richiede un'infrastruttura di dimensioni medio-grandi. Per funzionare necessita del backend in Django, del database PostgreSQL, di Redis per le code di task in background (Celery) e di un web server per gestire i file statici e i media. Questo lo rende più oneroso da manutenere per un singolo artista.
* **TuneCamp** punta sulla massima leggerezza ed è scritto interamente in TypeScript. Il database è SQLite (tramite `better-sqlite3`), che risiede in un singolo file. La build di React viene compilata e servita direttamente dal server Node.js, consentendo di far girare l'intera piattaforma (incluso il database) in un singolo processo leggero o tramite un semplice file di configurazione Docker Compose.

### 3. Modello di Federazione
* **Funkwhale** implementa l'intero protocollo **ActivityPub** per la condivisione delle librerie. Gli utenti possono seguire canali o librerie ospitati su altri server e lo streaming dei contenuti viene richiesto e trasmesso tra le istanze federate.
* **TuneCamp** utilizza un **modello federativo ibrido**:
  * **Social (ActivityPub)**: Gestisce gli attori degli artisti e i follower esterni (es. utenti Mastodon o Funkwhale che possono seguire l'artista e ricevere notifiche sulle nuove pubblicazioni).
  * **Segnalazione (Zen Protocol)**: Utilizza un database p2p a grafo decentralizzato per scoprire gli URL delle altre istanze TuneCamp in modo sicuro.
  * **Catalogo (HTTP REST diretto)**: Per evitare la duplicazione dei dati e la desincronizzazione del catalogo, ogni istanza interroga in tempo reale l'endpoint `/api/catalog` dei peer scoperti, garantendo che le informazioni sulle tracce e i prezzi siano sempre freschi e accurati.

### 4. Monetizzazione e Web3
* **Funkwhale** è incentrato esclusivamente sull'ascolto libero e gratuito della musica federata. Non ha alcun modulo di pagamento.
* **TuneCamp** integra nativamente uno strato finanziario:
  * **Fiat**: Consente agli utenti senza portafoglio crypto di acquistare brani o album con carta di credito tramite Stripe.
  * **Web3**: Sfrutta la rete **Base** (L2 di Ethereum) per vendere brani sotto forma di NFT ERC-1155, acquistabili con USDC o ETH.
  * **Gated Access**: Gli artisti possono generare codici di sblocco temporanei o permanenti per consentire il download esclusivo della musica.

### 5. Ingestione dei Contenuti
* **Funkwhale** supporta il caricamento di file e cartelle musicali locali ed è in grado di importare audio da sorgenti esterne (es. URL di YouTube).
* **TuneCamp** include tool dedicati all'ingestione massiva per chi colleziona grandi librerie musicali:
  * **Soulseek & Torrent**: Integrazione nativa che permette di cercare e scaricare album da reti P2P direttamente dal pannello di amministrazione.
  * **Telegram Bot**: Un bot dedicato tramite cui l'amministratore dell'istanza può semplicemente inoltrare file audio in chat per vederli aggiunti ed elaborati automaticamente sul proprio server TuneCamp.
  * **Google Drive Storage**: Consente di utilizzare una cartella Drive remota al posto dello spazio su disco locale per ospitare i file musicali.

---

## Conclusioni: Quale Piattaforma Scegliere?

### Scegli Funkwhale se:
* Vuoi avviare una web radio comunitaria o una libreria musicale aperta da condividere con amici e utenti del Fediverse.
* Non hai intenzione di vendere musica e preferisci focalizzarti sulla catalogazione, l'ascolto gratuito o la pubblicazione di podcast.
* Desideri un'integrazione immediata ed esclusiva con l'ecosistema Mastodon/Pleroma.

### Scegli TuneCamp se:
* Sei un artista indipendente, un produttore o una piccola etichetta che vuole vendere musica direttamente, trattenendo fino al 100% dei ricavi.
* Vuoi una soluzione che si configuri in pochi minuti su un piccolo server economico (VPS) senza dover configurare molteplici componenti infrastrutturali (Redis, PostgreSQL, Celery).
* Vuoi sperimentare la distribuzione basata su blockchain (Base Network) per creare NFT musicali e attivare un modello di fan-ownership.
* Cerchi flessibilità nella gestione dei file tramite bot Telegram o archiviazione su Google Drive.
