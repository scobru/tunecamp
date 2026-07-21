# TuneCamp Audiofabric

Un visualizzatore musicale 3D WebGL in tempo reale alimentato dalle API Web Audio e Three.js. Genera un tessuto di frequenze basato su fisica a molle che pulsa e si muove a ritmo di musica.

Audiofabric è integrato in TuneCamp come app Lab integrata, seminata nella tabella `lab_apps` puntando all'istanza deployata su `https://tunecamp-audiofabric.vercel.app`.

## Caratteristiche

- **Visualizzatore Fisico 3D**: Griglia di tessuto di frequenze interattiva con dinamiche personalizzabili e reattive.
- **Pannello di Controllo**: Consente di scegliere le tracce, regolare le impostazioni di visualizzazione e ispezionare i dettagli dei brani.
- **Streaming API Subsonic**: Riproduce l'audio direttamente dalla tua libreria TuneCamp utilizzando il protocollo dell'API Subsonic.
- **Interattività**: Trascina e scorri all'interno del canvas WebGL per spostare, ruotare e zoomare il tessuto 3D.

## Dettagli di Integrazione

- **Repository del Codice Sorgente**: [github.com/scobru/tunecamp-audiofabric](https://github.com/scobru/tunecamp-audiofabric) (derivato da [github.com/rolyatmax/audiofabric](https://github.com/rolyatmax/audiofabric))
- **Categoria**: Visualizzazione / Effetti
- **Permessi Richiesti**: `autoplay` (configurato nell'elenco allow dell'iFrame per avviare automaticamente la riproduzione audio al caricamento).
- **Metodo di Hosting**: Opzione A (URL esterno — deployato su Vercel a `tunecamp-audiofabric.vercel.app`, seminato tramite la riga id 2 della tabella `lab_apps`).

## Come riprodurre in Streaming dalla Libreria TuneCamp

Per riprodurre in streaming le tracce direttamente dall'endpoint dell'API Subsonic della tua istanza TuneCamp all'interno di Audiofabric:
1. Aggiungi i parametri di query per la configurazione Subsonic all'URL del Lab:
   `?tc=URL_SERVER&u=UTENTE&p=PASSWORD`
2. Audiofabric interrogherà automaticamente il server e caricherà le tracce della tua libreria all'interno del suo selettore di playlist personalizzato.
