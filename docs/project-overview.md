# Panoramica del Progetto TuneCamp

TuneCamp è una piattaforma musicale decentralizzata e federata che combina le funzionalità di un server musicale personale con le capacità dei protocolli social moderni (ActivityPub) e del web3 (IPFS/Zen).

## Obiettivi del Progetto

- **Proprietà dei Dati**: Consentire agli utenti di ospitare e controllare la propria libreria musicale.
- **Federazione**: Permettere l'interazione tra diversi server TuneCamp tramite il protocollo ActivityPub (Fediverse).
- **Decentralizzazione**: Utilizzare tecnologie come Zen/IPFS per la distribuzione e la resilienza dei contenuti.
- **Supporto agli Artisti**: Facilitare la pubblicazione diretta, il crowdfunding e la gestione dei diritti tramite contratti intelligenti e sistemi di sblocco.
- **Arricchimento Metadati**: Integrazione con iTunes e Lyrics.ovh per automatizzare il recupero di cover ad alta risoluzione e testi delle canzoni.

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
- **Decentralizzazione**: Integrazione Zen.js per reti P2P

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
