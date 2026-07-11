# Panoramica del Progetto TuneCamp

TuneCamp è una piattaforma musicale federata e self-hosted che combina un server musicale personale con i protocolli social del Fediverso (ActivityPub), la scoperta di istanze basata su gossip HTTP e la monetizzazione web3 (pagamenti on-chain su rete Base).

## Obiettivi del Progetto

- **Proprietà dei Dati**: Consentire agli utenti di ospitare e controllare la propria libreria musicale.
- **Federazione**: Abilitare l'interazione tra diversi server TuneCamp tramite il protocollo ActivityPub (Fediverso).
- **Scoperta Decentralizzata**: Utilizzare un protocollo di gossip HTTP per scoprire altre istanze TuneCamp; lo scambio dei cataloghi avviene poi direttamente tramite HTTP.
- **Supporto agli Artisti**: Facilitare la pubblicazione diretta, il crowdfunding e la gestione dei diritti tramite smart contract e sistemi di sblocco (unlock code).
- **Arricchimento dei Metadati**: Integrazione con molteplici provider (MusicBrainz, Discogs, iTunes, TheAudioDB, Spotify, Bandcamp, SoundCloud) e Lyrics.ovh per copertine e testi ad alta risoluzione.

## Caratteristiche Principali

- **Radio**: una stazione HLS sempre attiva trasmessa a partire dalla libreria dell'istanza — gli amministratori possono combinare playlist personalizzate e mix dinamici per genere. Vedi [radio.md](./radio.md).
- **Accesso tramite IA (MCP)**: un server basato su Model Context Protocol che consente ai client IA (es. Claude Desktop) di effettuare ricerche nel catalogo e avviare azioni tramite un canale sicuro protetto da token. Vedi [mcp-setup-guide.md](./mcp-setup-guide.md).
- **Lab**: incorpora strumenti audio sperimentali basati su browser in iFrame sandbox isolati, senza toccare la base di codice principale. Vedi [LAB.md](./LAB.md).
- **Pannello di Sistema Amministratore**: metriche in tempo reale di CPU/RAM/archiviazione/attività in background per rilevare eventuali perdite di memoria (memory leak). Vedi [monitoring.md](./monitoring.md).
- **Estensibilità**: provider backend integrati (metadati, streaming, archiviazione, …) dietro registry per-provider. L'acquisizione (ricerca/download da sorgenti esterne) vive in Sidecamp, l'app desktop companion.

## Stack Tecnologico

### Backend
- **Linguaggio**: TypeScript
- **Runtime**: Node.js (Express)
- **Database**: SQLite (tramite `better-sqlite3`)
- **Federazione**: Fedify (ActivityPub)
- **Multimedia**: FFmpeg (per la transcodifica e la generazione delle forme d'onda)

### Webapp (Frontend)
- **Framework**: React
- **Strumento di Build**: Vite
- **Stile**: CSS (con supporto per i temi)
- **Gestione dello Stato**: Zustand
- **Scoperta**: Gossip HTTP (esclusivamente per scoprire altre istanze; nessuna distribuzione P2P dei file audio)

### Blockchain e Smart Contract
- **Linguaggio**: Solidity
- **Contratti**: Checkout, Factory, NFT per la vendita e la gestione della proprietà delle tracce.

## Struttura del Repository

Il progetto è organizzato come un monorepo composto dalle seguenti cartelle principali:

- `src/server/`: Logica principale del backend, database, rotte e protocolli.
- `webapp/`: Applicazione frontend React.
- `contracts/`: Smart contract per le funzionalità web3.
- `docs/`: Documentazione tecnica del progetto.

## Repository Correlati

| Repo | Descrizione |
|------|-------------|
| [tunecamp](https://github.com/scobru/tunecamp) | Server principale + webapp |
| [sidecamp](https://github.com/scobru/sidecamp) | App Desktop autonoma per Condivisione Peer, Soulseek e Torrents |
| [tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder) | Registratore a 4 tracce basato su browser (componente Svelte 5) |
| [tunecamp-website](https://github.com/scobru/tunecamp-website) | Landing page e directory della community |

## Documentazione Correlata

- [Analisi Albero Sorgenti](./source-tree-analysis.md)
- [Architettura Backend](./architecture-backend.md)
- [Architettura Webapp](./architecture-webapp.md)
- [Inventario Componenti UI](./component-inventory.md)
- [Contratti API](./api-contracts.md)
- [Modelli Dati](./data-models.md)
- [Guida allo Sviluppo](./development-guide.md)
