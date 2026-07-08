# Integrazione con Soulseek

TuneCamp si integra con la rete P2P **Soulseek** per consentire agli amministratori di cercare e scaricare file musicali direttamente da altri utenti.

## 1. Architettura

L'integrazione con Soulseek è un plugin autonomo in `src/server/plugins/soulseek/` (`service.ts` per il client, `provider.ts` per il wrapper `DownloadProvider`). Utilizza un client personalizzato per connettersi al server Soulseek e gestire i trasferimenti di file peer-to-peer.

> **Attivazione esplicita (Opt-in):** Soulseek è disabilitato per impostazione predefinita per motivi legali e deve essere abilitato esplicitamente tramite l'opzione dei plugin nel pannello di amministrazione.

### Caratteristiche Principali
- **Ricerca Globale**: Cerca tracce o album nell'intera rete Soulseek.
- **Sfoglia Cartelle Peer**: Visualizza i file condivisi da uno specifico utente di Soulseek.
- **Coda di Download**: Gestisce più download simultanei con tentativi di ripristino automatici in caso di errore.
- **Importazione Automatica**: Una volta completato il download, i file vengono passati al componente `Scanner` per l'elaborazione e aggiunti alla libreria.

## 2. Struttura delle Cartelle

I download effettuati da Soulseek vengono memorizzati nel percorso:
- **Percorso**: `music/downloads/soulseek/`

## 3. Configurazione

Normalmente configurabile tramite il Pannello di Amministrazione → sezione Integrations. Variabili d'ambiente di fallback:
- `SLSK_USER`: Il nome utente del tuo account Soulseek.
- `SLSK_PASS`: La password del tuo account Soulseek.

## 4. Limitazione del Tasso (Rate Limiting) e Sicurezza

Per evitare di essere bananti o di sovraccaricare il server:
- **Limiti di Ricerca**: Il sistema applica un ritardo obbligatorio tra le ricerche.
- **Slot di Download**: Solo un numero limitato di file viene scaricato simultaneamente.
- **Convalida dei File**: L'integrità dei file scaricati viene verificata prima dell'importazione nella libreria.

## 5. Flusso di Utilizzo

1. **Ricerca**: L'amministratore inserisce una chiave di ricerca nella scheda Soulseek della dashboard.
2. **Risultati**: Viene mostrato un elenco di file corrispondenti provenienti dai vari utenti, con informazioni sul bitrate e sulla dimensione del file.
3. **Coda**: L'amministratore seleziona i file da scaricare, che vengono aggiunti alla coda interna.
4. **Trasferimento**: Il server stabilisce una connessione P2P diretta con l'utente remoto per scaricare il file.
5. **Acquisizione**: Una volta completato, il file viene spostato nella libreria e scansionato.
