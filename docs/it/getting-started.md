# Per Iniziare

Questa pagina ti guiderà da una configurazione vuota a un'istanza TuneCamp attiva contenente la tua musica. L'intera procedura richiede circa 10 minuti. Per argomenti più approfonditi, consulta i collegamenti alla fine.

> **Nuovo su TuneCamp?** È una piattaforma musicale self-hosted: il tuo server di streaming personale dotato di un lettore web, supporto per app mobili (Subsonic), federazione nel Fediverso (ActivityPub) e monetizzazione Web3 opzionale. Lo gestisci tu; i dati sono di tua proprietà.

## Deploy su Railway (senza VPS)

Non hai un server? Esegui il deploy direttamente dal template ufficiale Railway — un click, HTTPS incluso:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/tunecamp?referralCode=BUSsSY&utm_medium=integration&utm_source=template&utm_campaign=generic)

Vedi la [guida completa al deploy su Railway](../railway.md) per variabili d'ambiente, storage persistente e configurazione della federazione (solo in inglese).

---

## 1. Prerequisiti

Il percorso più rapido prevede l'uso di Docker. Avrai bisogno di:

- **Docker 20+** e **Docker Compose v2.24+** (il compose file segna `.env` come
  opzionale, cosa che richiede la sintassi lunga di `env_file`). Usa
  `docker compose`, il sottocomando v2 — il binario separato `docker-compose` è
  a fine vita dal 2023.
- Una cartella di file audio (MP3, FLAC, WAV, …)

> Preferisci eseguire il codice sorgente per scopi di sviluppo? Consulta la [Guida allo Sviluppo](./development-guide.md).

## 2. Installazione ed esecuzione

Scegli una delle seguenti opzioni di installazione:

### Opzione A: VPS Auto-Installer (Consigliato)
Se hai noleggiato una VPS Linux pulita (Ubuntu/Debian), esegui questo singolo comando per installare automaticamente Docker, Docker Compose, Nginx, Certbot (SSL), configurare il reverse proxy, clonare il repository e avviare TuneCamp:

```bash
curl -fsSL https://tunecamp.org/install.sh | sudo bash
```

### Opzione B: Configurazione manuale con Docker
Se preferisci gestire autonomamente i prerequisiti e la configurazione:

```bash
# 1. Clona il repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# 2. Opzionale: metti qui l'audio adesso — la prima scansione lo raccoglierà
mkdir -p music && cp -r ~/Album/* music/

# 3. Avvia in background
docker compose up -d --build
```

Quando il container è avviato correttamente, apri `http://localhost:1970` (o il tuo dominio) nel browser.

**La tua musica sta altrove?** Imposta `TUNECAMP_MUSIC_PATH=/percorso/musica` in
`.env` — è la cartella dell'host che Compose monta nel container. Con Docker non
impostare `TUNECAMP_MUSIC_DIR`: il compose file lo fissa già al punto di
montaggio. [Aggiungere Musica](./adding-music.md) spiega la differenza.

**Devi modificare il deploy stesso** — nome del container, reti aggiuntive,
label del proxy, altri volumi? Non toccare `docker-compose.yml`. Copia
`docker-compose.override.yml.example` in `docker-compose.override.yml`: Compose
lo unisce automaticamente ed è in `.gitignore`, così `git pull` non entra mai in
conflitto con la tua configurazione.

## 3. Primo accesso e messa in sicurezza dell'istanza

Al primo avvio, TuneCamp crea un account amministratore predefinito:

| Nome Utente | Password |
|-------------|----------|
| `admin`     | `admin`  |

(Puoi sovrascrivere queste credenziali prima del primo avvio impostando le variabili d'ambiente `TUNECAMP_ADMIN_USER` e `TUNECAMP_ADMIN_PASS`.)

**Modifica la password dell'amministratore immediatamente** dopo il primo accesso, andando su **Admin → Settings**. All'avvio, il server registra un avviso di sicurezza se l'account admin, le impostazioni CORS o il segreto JWT generato automaticamente sono rimasti a quelli predefiniti — consulta il [riferimento per la configurazione](https://github.com/scobru/tunecamp/blob/main/README.md#configuration) per proteggere la tua istanza.

> Una procedura guidata integrata forza la modifica della password per qualsiasi account che utilizzi ancora credenziali predefinite, e il server la fa rispettare: finché la password non viene cambiata, quell'account riceve `403` su ogni endpoint tranne quelli necessari a cambiarla, e Subsonic (`/rest`) viene rifiutato del tutto. Gli ascoltatori anonimi non sono toccati. I dettagli sono disponibili in [Ruoli e Permessi](./ROLES.md#primo-accesso-procedura-guidata-di-configurazione).

## 4. Aggiungi la tua musica

Copia i file nella cartella musicale (`./music` di default, una cartella per album):

- **Watcher automatico in tempo reale (Drop & Auto-Import)**: TuneCamp monitora la tua cartella musica (`TUNECAMP_MUSIC_PATH` / `./music`) in tempo reale. I file audio e le cartelle rilasciati al suo interno vengono importati automaticamente nella libreria come **album privati in bozza** non appena la scrittura è completata.
- **Scansione manuale**: Puoi anche andare su **`/admin` → scheda Maintenance** e premere **`Rescan Library`** per effettuare una riscansione su richiesta. `/admin` → Settings → *Scheduled Library Scan* la esegue ogni giorno all'ora configurata.

TuneCamp leggerà i tag dei metadati, genererà le forme d'onda e caricherà le copertine. Le cartelle scansionate diventano **album privati in bozza**, elencati in **`/my-music`**. Sono nella tua libreria e invisibili al pubblico finché non li promuovi: `Promote` in `/my-music` trasforma un album in una *release formale*, poi la **scheda Releases di `/admin`** è dove ne compili i metadati e la **pubblichi**.

Per caricare invece tramite browser, **`/admin/release/new`** crea una release e ne carica l'audio in un colpo solo, compilando titolo, artista, anno ed elenco tracce dai tag dei file stessi.

Puoi anche importare file musicali tramite il [bot Telegram](./telegram.md), l'[app desktop Sidecamp](./sidecamp.md) (Soulseek, torrent, yt-dlp) o [Google Drive](./google-drive.md).

**[Aggiungere Musica](./adding-music.md) è il riferimento completo** — struttura della libreria su disco, a cosa serve ogni cartella sotto `music/` e come modificare la libreria senza confondere il database.

## 5. Ascolta

- **Lettore web** — già attivo all'indirizzo `http://localhost:1970`, con visualizzazione della forma d'onda, coda di riproduzione, testi dei brani e scorciatoie da tastiera.
- **App per cellulari / computer** — TuneCamp implementa l'intera API Subsonic. Puoi connettere qualsiasi client Subsonic (DSub, Symfonium, Tempo, Substreamer) inserendo l'URL del tuo server e le tue credenziali TuneCamp. Consulta la guida al [Protocollo Subsonic](./subsonic.md).

## 6. Passi successivi

Ora disponi di un'istanza funzionante. Scegli il percorso che più si adatta alle tue esigenze:

| Se vuoi… | Leggi |
|---|---|
| Configurare un dominio reale con SSL | [Configurazione Nginx](./NGINX.md) |
| Condividerla da un computer di casa, senza dominio | `docker compose --profile tunnel up -d` — vedi [README](https://github.com/scobru/tunecamp#public-url-without-a-domain) |
| Collegare pagamenti Stripe o crypto | [Configurazione API e Servizi](./api-setup-guide.md) → [Pagamenti](./payments.md) |
| Unirti alla rete federata | [Federazione](./FEDERATION.md) |
| Capire cosa può fare ciascun utente | [Ruoli e Permessi](./ROLES.md) |
| Proteggere i tuoi dati | [Backup e Migrazione](./backup-migration.md) |
| Gestire l'istanza in produzione su larga scala | [Monitoraggio](./monitoring.md) · [Scalabilità](./scaling.md) |
| Contribuire al codice | [Guida allo Sviluppo](./development-guide.md) · [Contribuire](./CONTRIBUTING.md) |

Consulta l'[indice completo della documentazione](./index.md) per tutto il resto.
