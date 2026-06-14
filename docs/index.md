# Indice della Documentazione di Progetto

Benvenuto nella documentazione tecnica di **TuneCamp**. Questo indice serve come punto di ingresso principale per comprendere l'architettura, le tecnologie e il funzionamento del sistema.

### Panoramica del Progetto

- [**Stato del Progetto**](./STATUS.md): Maturità onesta di ogni area (stable/beta/opt-in) e limiti noti.
- [**Panoramica Progetto**](./project-overview.md): Obiettivi, stack tecnologico e struttura generale.
- [**Analisi dell'Albero dei Sorgenti**](./source-tree-analysis.md): Descrizione dettagliata delle directory e dei punti di ingresso.

### Architettura Tecnica

- [**Architettura Backend**](./architecture-backend.md): Dettagli sul server Express, SQLite, ActivityPub e integrazione Zen.
- [**Architettura Webapp**](./architecture-webapp.md): Dettagli sull'applicazione React, gestione dello stato e discovery delle istanze.
- [**Modelli Dati**](./data-models.md): Schema del database e relazioni tra le entità.

### Riferimenti API e Componenti

- [**Contratti API**](./api-contracts.md): Documentazione degli endpoint REST, autenticazione e protocolli supportati.
- [**Inventario Componenti UI**](./component-inventory.md): Catalogo dei componenti React della webapp.

### Guida per lo Sviluppatore

- [**Guida allo Sviluppo**](./development-guide.md): Prerequisiti, installazione, esecuzione e test.
- [**Configurazione API**](./api-setup-guide.md): Guida passo-passo per Stripe, Google Drive, AI e altro.
- [**CONTRIBUTING.md**](./CONTRIBUTING.md): Linee guida per la contribuzione al codice.

---

### Documentazione Aggiuntiva (Specifica)

- [Pagamenti & Monetizzazione](./payments.md): Stripe Checkout, Onramp e verifica on-chain.
- [Integrazioni AI](./ai-integrations.md): Automazione metadati e raccomandazioni via OpenRouter.
- [Google Drive Integration](./google-drive.md): Streaming e importazione dal cloud.
- [Sistema Torrent](./torrents.md): Integrazione WebTorrent per il download di musica.
- [Soulseek Integration](./soulseek.md): Ricerca e download P2P.
- [Social & Community](./social-features.md): Post, commenti e interazioni fan.
- [Smart Contracts](./smart-contracts.md): Guida tecnica ai contratti Solidity su Base.
- [Backup & Migrazione](./backup-migration.md): Come salvaguardare e spostare la tua istanza.
- [Scaling & Limiti di Concorrenza](./scaling.md): Limiti pratici di SQLite/single-process e come mitigarli.
- [Security Review Pagamenti](./security-review-payments.md): Finding corretti e aperti del flusso pagamenti.
- [Federazione](./FEDERATION.md): Dettagli sul protocollo ActivityPub in TuneCamp.
- [Subsonic](./subsonic.md): Supporto al protocollo Subsonic per client esterni.
- [Nginx](./NGINX.md): Esempi di configurazione per reverse proxy.
- [Audio Fingerprinting](./audio-fingerprinting.md): Impronta audio interna usata per la deduplicazione della libreria.
- [Monitoring & Alerting](./monitoring.md): Health endpoint, crash reporting Sentry e uptime check esterni.
- [Telegram Bot](./telegram.md): Ingestione rapida di file musicali e gestione remota.
- [Plugin](./PLUGINS.md): Provider custom (streaming, metadata, storage) da una directory plugins.
- [Ruoli & Permessi](./ROLES.md): RBAC — Instance Owner, Manager, Curator, Listener.
- [Diventare Artista & Vendite](./community-mode.md): Flusso richiesta artista e gate di vendita `can_sell`.
- [Confronto con Funkwhale](./comparison-funkwhale.md): Differenze di modello e funzionalità.

---

*Ultimo aggiornamento: 14 Giugno 2026*
