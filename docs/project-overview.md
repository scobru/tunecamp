# Panoramica del Progetto TuneCamp

TuneCamp è una piattaforma musicale federata e self-hosted che combina un server musicale personale con i protocolli social del Fediverso (ActivityPub), la discovery decentralizzata delle istanze (Zen) e la monetizzazione web3 (pagamenti on-chain su Base).

## Obiettivi del Progetto

- **Proprietà dei Dati**: Consentire agli utenti di ospitare e controllare la propria libreria musicale.
- **Federazione**: Permettere l'interazione tra diversi server TuneCamp tramite il protocollo ActivityPub (Fediverse).
- **Discovery Decentralizzata**: Usare Zen come livello di signaling per scoprire altre istanze TuneCamp; i cataloghi vengono poi scambiati direttamente via HTTP.
- **Supporto agli Artisti**: Facilitare la pubblicazione diretta, il crowdfunding e la gestione dei diritti tramite contratti intelligenti e sistemi di sblocco.
- **Arricchimento Metadati**: Integrazione con più provider (MusicBrainz, Discogs, iTunes, TheAudioDB, Spotify, Bandcamp, SoundCloud) e Lyrics.ovh per cover ad alta risoluzione e testi.

## Stack Tecnologico

### Backend
- **Linguaggio**: TypeScript
- **Runtime**: Node.js (Express)
- **Database**: SQLite (tramite `better-sqlite3`)
- **Federazione**: Fedify (ActivityPub)
- **Multimedia**: FFmpeg (per transcodifica e generazione waveform)

### Webapp (Frontend)
- **Framework**: React
- **Build Tool**: Vite
- **Styling**: CSS (con supporto per temi)
- **State Management**: Zustand
- **Discovery**: Zen.js (solo per scoprire altre istanze; nessuna distribuzione P2P dei contenuti)

### Blockchain & Smart Contracts
- **Linguaggio**: Solidity
- **Contratti**: Checkout, Factory, NFT per la gestione delle vendite e della proprietà.

## Struttura del Repository

Il progetto è organizzato come un monorepo con le seguenti directory principali:

- `src/server/`: Logica core del backend, database, rotte e protocolli.
- `webapp/`: Applicazione frontend React.
- `contracts/`: Smart contracts per le funzionalità web3.
- `website/`: Sito web statico di presentazione.
- `docs/`: Documentazione tecnica del progetto.

## Documentazione Correlata

- [Analisi dell'Albero dei Sorgenti](./source-tree-analysis.md)
- [Architettura Backend](./architecture-backend.md)
- [Architettura Webapp](./architecture-webapp.md)
- [Inventario Componenti](./component-inventory.md)
- [Contratti API](./api-contracts.md)
- [Modelli Dati](./data-models.md)
- [Guida allo Sviluppo](./development-guide.md)
