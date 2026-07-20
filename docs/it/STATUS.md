# Stato del Progetto

Un quadro sincero di quanto ciascuna parte di TuneCamp sia pronta per la produzione. Aggiornato all'8 Luglio 2026.

**In generale**: progetto giovane, gestito da un singolo maintainer. Solido per un singolo artista self-hosted o una piccola etichetta in grado di tollerare qualche difetto; non è ancora un sostituto immediato per una piattaforma gestita. Oltre 600 test automatizzati, nessun audit di sicurezza esterno.

## Per area

| Area | Stato | Note |
|------|--------|-------|
| Libreria, scansione, streaming | **Stabile** | Funzionalità principale sin dall'inizio; analisi tramite pool di worker, pre-transcodifica dei formati lossless, API Subsonic/OpenSubsonic. |
| Web player e pagine artista | **Stabile** | |
| Pagamenti Stripe e codici di sblocco | **Beta** | Revisionato internamente (vedi [security-review-payments.md](./security-review-payments.md)); nessun audit esterno. Si consiglia di testare inizialmente con piccoli importi. |
| Pagamenti on-chain (Base, NFT) | **Beta / opzionale** | Disabilitati di default (`web3Enabled`). Le assunzioni di fiducia sono documentate nella revisione della sicurezza. |
| Federazione (ActivityPub + catalogo) | **Beta** | Segue istanze da Mastodon/Funkwhale; cataloghi dei peer memorizzati in cache con stale-while-revalidate. Possibili piccoli problemi di interoperabilità. |
| Sidecamp (Peer Sharing) | **Beta** | Condivisione peer transitoria tramite tunnel WebSocket, importazione locale. Vedi [sidecamp.md](./sidecamp.md). |
| Live streaming (HLS) | **Nuovo** | Migrato di recente da mesh WebRTC a HLS lato server; testato in contesti reali limitati. |
| Radio (stazione HLS) | **Nuovo** | Stazione sempre attiva da playlist + mix dinamici per genere; loop di concatenazione FFmpeg. Vedi [radio.md](./radio.md). |
| Server MCP | **Nuovo / opzionale** | Espone il catalogo ai client IA (ricerca, statistiche, scansione) tramite SSE, protetto da token. Vedi [mcp-setup-guide.md](./mcp-setup-guide.md). |
| App Lab | **Sperimentale** | Strumenti audio per browser protetti da iFrame sandbox; bridge PostMessage implementato (getUser/getLibrary/getNowPlaying/exportAudio). Vedi [LAB.md](./LAB.md). |
| Pannello di sistema amministratore | **Nuovo** | Metriche in tempo reale di CPU/RAM/archiviazione/attività per il rilevamento di leak. Vedi [monitoring.md](./monitoring.md). |
| Bot Telegram, archiviazione Google Drive | **Beta** | Funzionali, copertura dei test più limitata. |
| Streaming SoundCloud e Bandcamp | **Opzionale** | Integrazione streaming tramite provider SoundCloud / Bandcamp; abilita in Amministrazione → Integrazioni. |
| Soulseek e Torrent | **Delegati a Sidecamp** | Il download P2P è interamente delegato all'app desktop Sidecamp per mantenere pulito il server. |
| Backup e ripristino | **Stabile** | Strumenti UI + CLI; vedi [backup-migration.md](./backup-migration.md). Valuta Litestream per la replica continua ([scaling.md](./scaling.md)). |

## Limiti noti

- Singolo processo, singolo writer SQLite — modello di scalabilità e tetti massimi descritti in [scaling.md](./scaling.md).
- Nessun audit di sicurezza esterno; i flussi di pagamento sono stati revisionati internamente, con i problemi aperti tracciati in [security-review-payments.md](./security-review-payments.md).
- Comunità di piccole dimensioni: aspettati di dover effettuare tu stesso il debug di alcuni problemi e di segnalarli.
