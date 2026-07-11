---
layout: home

hero:
  name: "TuneCamp"
  text: "Piattaforma Musicale Federata"
  tagline: Streaming self-hosted per artisti indipendenti, etichette e comunità — con supporto a federazione, Web3 e Subsonic.
  actions:
    - theme: brand
      text: Inizia
      link: /it/getting-started
    - theme: alt
      text: Vedi su GitHub
      link: https://github.com/scobru/tunecamp

features:
  - icon: 🎵
    title: Streaming e Client
    details: API Subsonic completa, live streaming HLS, playlist e supporto per client multipiattaforma.
  - icon: 🌐
    title: Federato da Progetto
    details: La federazione basata su ActivityPub consente alle istanze di scoprire e condividere contenuti in rete.
  - icon: 💎
    title: Web3 e Monetizzazione
    details: Minting NFT, pagamenti Stripe, contratti factory e integrazione wallet su Base.
  - icon: 🔌
    title: Estensibile tramite Plugin
    details: Provider di streaming, metadati e archiviazione personalizzati tramite un semplice sistema di plugin.
  - icon: 🤖
    title: Metadati potenziati da IA
    details: Arricchimento automatico dei metadati e raccomandazioni tramite integrazioni OpenRouter.
  - icon: 🛡️
    title: RBAC e Sicurezza
    details: Controllo degli accessi basato sui ruoli con livelli di proprietario dell'istanza, manager, curatore e ascoltatore.
---

## Documentazione

### 🚀 Per Iniziare

**Nuovo qui? Comincia con la guida [Inizia](./getting-started.md).** Ti guiderà da una macchina vuota a un'istanza TuneCamp attiva con musica al suo interno — installazione, primo accesso, aggiunta della libreria e ascolto — in circa 10 minuti.

Una volta avviato, le guide qui sotto ti permetteranno di approfondire.

| Documento | Descrizione |
|-----|-------------|
| [Inizia](./getting-started.md) | **Installazione → primo accesso → aggiunta musica → ascolto** (inizia da qui) |
| [Configurazione API e Servizi](./api-setup-guide.md) | Configurazione passo-passo per Stripe, Google Drive, IA e altre integrazioni |
| [Configurazione Nginx](./NGINX.md) | Configurazione del reverse proxy per SSL, WebSocket e HLS |
| [Backup e Migrazione](./backup-migration.md) | Backup del database, ripristino e spostamento dell'istanza |

---

### Guida Utente

Per ascoltatori e artisti che utilizzano un'istanza TuneCamp.

| Documento | Descrizione |
|-----|-------------|
| [Ruoli e Permessi](./ROLES.md) | Cosa può fare ciascun ruolo (Proprietario, Manager, Curatore, Ascoltatore) |
| [Radio](./radio.md) | Trasmissione di una stazione sempre attiva dalla tua libreria (playlist + mix di genere) |
| [Protocollo Subsonic](./subsonic.md) | Collegamento di client esterni (DSub, Symfonium, Tempo, Substreamer) |
| [Funzionalità Social e Community](./social-features.md) | Post, commenti e interazioni con i fan |
| [Diventare un Artista e Vendere](./community-mode.md) | Flusso di richiesta artista e gate di vendita `can_sell` |
| [Pagamenti e Monetizzazione](./payments.md) | Checkout Stripe, on-ramp crypto e acquisti on-chain |

---

### Guida Amministratore

Per chi gestisce un'istanza TuneCamp.

| Documento | Descrizione |
|-----|-------------|
| [Federazione](./FEDERATION.md) | Scoperta ActivityPub e HTTP gossip — come le istanze si trovano a vicenda |
| [Sidecamp Desktop](./sidecamp.md) | App Desktop per la Condivisione Peer, Soulseek e Torrents |
| [Monitoraggio](./monitoring.md) | Endpoint `/health`, pannello delle risorse di sistema dell'amministratore, report sui crash Sentry e controlli di uptime |
| [Scalabilità](./scaling.md) | Limiti del singolo processo e di SQLite e relative mitigazioni |
| [Configurazione MCP](./mcp-setup-guide.md) | Esposizione del catalogo TuneCamp ai client IA tramite MCP |

---

### Guida Sviluppatore

Per contributori e sviluppatori su TuneCamp.

| Documento | Descrizione |
|-----|-------------|
| [Guida allo Sviluppo](./development-guide.md) | Configurazione dell'ambiente di sviluppo locale, esecuzione e test |
| [Contribuire](./CONTRIBUTING.md) | Linee guida per la contribuzione del codice e processo di pull request |
| [Architettura Backend](./architecture-backend.md) | Server Express, SQLite, ActivityPub e scoperta federata |
| [Architettura Webapp](./architecture-webapp.md) | React, Vite, Zustand e scoperta dell'istanza nel frontend |
| [Inventario dei Componenti UI](./component-inventory.md) | Catalogo dei componenti React della webapp per directory |
| [Modelli Dati](./data-models.md) | Schema del database e relazioni tra entità |
| [Contratti API](./api-contracts.md) | Endpoint REST, autenticazione e protocolli supportati |
| [Albero dei Sorgenti](./source-tree-analysis.md) | Struttura delle directory e punti di ingresso |
| [Applicazioni Lab](./LAB.md) | Creazione e invio di strumenti audio sperimentali |
| [App Lab: Audiofabric](./audiofabric.md) | Visualizzatore musicale 3D WebGL in tempo reale integrato in Lab |
| [App Lab: Registratore a 4 Tracce](./4-track-recorder.md) | Pacchetto companion registratore a cassette a 4 tracce basato su browser |

---

### Integrazioni

Servizi di terze parti opzionali che puoi collegare alla tua istanza.

| Documento | Descrizione |
|-----|-------------|
| [Integrazioni IA](./ai-integrations.md) | Automazione dei metadati e raccomandazioni tramite OpenRouter |
| [Smart Contracts](./smart-contracts.md) | Contratti Solidity (Factory, NFT, Checkout) su Base |
| [Google Drive](./google-drive.md) | Backend di archiviazione cloud per file multimediali |
| [Sidecamp](./sidecamp.md) | Acquisizione P2P (Soulseek, BitTorrent, yt-dlp) tramite l'app desktop companion |
| [Bot Telegram](./telegram.md) | Acquisizione rapida di file e gestione remota |

---

### Riferimento

| Documento | Descrizione |
|-----|-------------|
| [Panoramica del Progetto](./project-overview.md) | Obiettivi, stack tecnologico e struttura del repository |
| [Stato e Maturità](./STATUS.md) | Stato di maturità reale di ciascuna area e limitazioni note |
| [Confronto con Funkwhale](./comparison-funkwhale.md) | Differenze nei modelli e nelle funzionalità |
| [Impronte Digitali Audio](./audio-fingerprinting.md) | Come TuneCamp rileva i duplicati dei brani nella libreria |
| [Revisione Sicurezza Pagamenti](./security-review-payments.md) | Risultati della revisione interna della sicurezza del flusso di pagamento |

---

*Ultimo aggiornamento: 25 Giugno 2026*
