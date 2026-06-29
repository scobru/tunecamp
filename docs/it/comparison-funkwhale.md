# Confronto: Funkwhale vs TuneCamp

Questo documento fornisce un confronto onesto e dettagliato tra **Funkwhale** e **TuneCamp**, due piattaforme musicali federate progettate per scopi, architetture e destinatari differenti.

---

## Tabella di Confronto Rapido

| Caratteristica | Funkwhale | TuneCamp |
| :--- | :--- | :--- |
| **Caso d'uso Principale** | Condivisione comunitaria di musica e podcast | Autopubblicazione e vendita per artisti/etichette |
| **Stack Backend** | Python (Django) + PostgreSQL + Redis | Node.js (TypeScript) + SQLite |
| **Stack Frontend** | Vue.js | React + Vite + Tailwind CSS / DaisyUI |
| **Modello di Federazione** | ActivityPub nativo (replica parziale delle librerie tra pod) | **Ibrido**: ActivityPub (sociale) + Scoperta Gossip (nodi via HTTP/NodeInfo) + REST HTTP |
| **Monetizzazione** | Nessuna | **Integrata**: NFT (ERC-1155 su rete Base) + Stripe (Valuta Fiat) |
| **Compatibilità Mobile** | API Subsonic | API Subsonic / OpenSubsonic |
| **Metodi di Acquisizione** | Caricamento web, importazione locale, YouTube | Caricamento web, Bot Telegram; Soulseek e BitTorrent disponibili ma disabilitati di default (opt-in admin) |
| **Funzionalità Social** | Commenti, preferiti, profili utente | Post nel Fediverso, commenti, live stream (HLS lato server) |
| **Difficoltà di Gestione** | Medio/Alta (molteplici servizi in esecuzione) | Bassa (singolo processo Node o leggero Docker Compose) |

---

## Analisi Dettagliata delle Funzionalità

### 1. Filosofia e Destinatari
* **Funkwhale** è nato con la visione di realizzare una sorta di "SoundCloud/Spotify nel Fediverso". È ideale per collettivi, appassionati di musica libera, creatori di podcast e utenti che desiderano ascoltare musica in streaming condividendo le proprie librerie con altri appassionati.
* **TuneCamp** è progettato specificamente come alternativa decentralizzata e self-hosted a **Bandcamp**. L'obiettivo principale è mettere al centro l'indipendenza finanziaria dell'artista, offrendo profili e gallerie personalizzate gestite direttamente dall'artista, senza intermediari o algoritmi centralizzati. A differenza di Funkwhale, la pubblicazione non è aperta a tutti i registrati: gli utenti registrati sono ascoltatori e chi desidera pubblicare deve richiedere un profilo artista che l'amministratore approva (l'account mantiene il ruolo `user` — è il collegamento al profilo artista a concedere i diritti di pubblicazione, senza promozione a Curatore); le vendite rimangono disabilitate per un artista finché l'amministratore non lo verifica (vedi [community-mode.md](./community-mode.md)).

### 2. Architettura e Semplicità di Hosting
* **Funkwhale** richiede un'infrastruttura di dimensioni medio-grandi. Ha bisogno di un backend in Django, un database PostgreSQL, Redis per le code di attività in background (Celery) e un server web per gestire i file statici e i contenuti multimediali. Questo lo rende più impegnativo da mantenere per un singolo artista.
* **TuneCamp** punta alla massima semplicità ed è scritto interamente in TypeScript. Il database è SQLite (tramite `better-sqlite3`), che risiede in un singolo file. Il build di React viene compilato e servito direttamente dal server Node.js, consentendo all'intera piattaforma (incluso il database) di essere eseguita in un unico processo leggero o tramite un semplice file Docker Compose.

### 3. Modello di Federazione
* **Funkwhale** implementa il protocollo **ActivityPub** completo per la condivisione delle librerie. Gli utenti possono seguire canali o librerie ospitati su altri server e lo streaming dei contenuti viene richiesto e trasmesso tra le istanze federate.
* **TuneCamp** utilizza un **modello federato ibrido**:
  * **Sociale (ActivityPub)**: Gestisce gli attori artista e i follower esterni (es. gli utenti di Mastodon o Funkwhale possono seguire l'artista e ricevere notifiche sulle nuove pubblicazioni).
  * **Scoperta (Gossip su HTTP/NodeInfo)**: Scopre le altre istanze TuneCamp nella rete tramite un gossip decentralizzato senza relay centrali.
  * **Catalogo (REST HTTP con cache)**: Per evitare la duplicazione dei dati e la desincronizzazione dei cataloghi, ogni istanza interroga l'endpoint `/api/catalog` dei peer scoperti. Le risposte vengono memorizzate nella cache SQLite con una strategia *stale-while-revalidate* (TTL 1 ora, scadenza massima 7 giorni): le richieste servono la copia in cache e la aggiornano in background, in modo che un peer temporaneamente offline non faccia sparire le sue tracce dalla rete. I dati sulle tracce e i prezzi sono quindi "freschi fino a circa 1 ora", non in tempo reale.

### 4. Monetizzazione e Web3
* **Funkwhale** è incentrato esclusivamente sull'ascolto gratuito della musica federata. Non ha alcun modulo di pagamento.
* **TuneCamp** integra un livello finanziario nativo:
  * **Fiat**: Consente agli utenti sprovvisti di wallet crypto di acquistare tracce o album con carta di credito tramite Stripe.
  * **Web3**: Sfrutta la rete **Base** (L2 di Ethereum) per vendere le tracce come NFT ERC-1155, acquistabili con USDC o ETH.
  * **Accesso Riservato**: Gli artisti possono generare codici di sblocco temporanei o permanenti per concedere l'accesso esclusivo al download della musica.

### 5. Acquisizione dei Contenuti
* **Funkwhale** supporta il caricamento di file e cartelle musicali locali e può importare audio da fonti esterne (es. URL di YouTube).
* **TuneCamp** include strumenti di acquisizione dedicati per gli utenti che collezionano grandi librerie musicali:
  * **Soulseek e Torrent (opt-in, disabilitati di default)**: Integrazione che consente di cercare e scaricare album dalle reti P2P direttamente dal pannello di amministrazione. Trattandosi di fonti legalmente "grigie" — problematiche come impostazione predefinita su una piattaforma che vende musica — questi plugin sono registrati come disabilitati e richiedono l'attivazione esplicita da parte dell'amministratore tramite l'opzione dei plugin. Lo stesso vale per gli scraper di flussi SoundCloud/Bandcamp. La responsabilità legale dell'attivazione ricade sull'amministratore dell'istanza.
  * **Bot Telegram**: Un bot dedicato in cui l'amministratore dell'istanza può semplicemente inoltrare i file audio in una chat per vederli aggiunti ed elaborati automaticamente sul proprio server TuneCamp.
  * **Archiviazione su Google Drive**: Consente di utilizzare una cartella Drive remota anziché lo spazio su disco locale per ospitare i file musicali.

---

## Conclusione: Quale Piattaforma Scegliere?

### Scegli Funkwhale se:
* Vuoi avviare una web radio comunitaria o una libreria musicale aperta da condividere con amici e utenti del Fediverso.
* Non hai intenzione di vendere musica e preferisci concentrarti sulla catalogazione, l'ascolto gratuito o la pubblicazione di podcast.
* Desideri un'integrazione immediata ed esclusiva con l'ecosistema Mastodon/Pleroma.

### Scegli TuneCamp se:
* Sei un artista indipendente, un produttore o una piccola etichetta che vuole vendere musica direttamente, senza commissioni di piattaforma se ospiti autonomamente la tua istanza (rimangono solo le commissioni di Stripe del ~2,9% + 0,30 € e i costi del VPS — vedi [pagamenti.md](./payments.md) per un'analisi onesta dei costi).
* Desideri una soluzione configurabile in pochi minuti su un server (VPS) economico senza dover configurare molteplici componenti infrastrutturali (Redis, PostgreSQL, Celery).
* Vuoi sperimentare la distribuzione basata su blockchain (Base Network) per creare NFT musicali e attivare un modello di possesso da parte dei fan.
* Vuoi flessibilità nella gestione dei file tramite bot Telegram o archiviazione su Google Drive.
