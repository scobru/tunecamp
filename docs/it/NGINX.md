# Guida alla Configurazione di Nginx per TuneCamp

Per eseguire TuneCamp in un ambiente di produzione, si raccomanda caldamente di utilizzare un reverse proxy come Nginx. Ciò consente la terminazione di SSL/TLS (requisito fondamentale per la federazione ActivityPub) e offre prestazioni migliori per servire gli asset statici.

## Configurazione Consigliata per Nginx

Di seguito è riportato un modello di configurazione standard. Sostituisci `tuo-dominio.com` con il tuo dominio reale e assicurati che i tuoi certificati SSL siano indicati correttamente.

```nginx
server {
    listen 80;
    server_name tuo-dominio.com;

    # Reindirizzamento a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name tuo-dominio.com;

    # Certificati SSL (ad esempio tramite Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/tuo-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tuo-dominio.com/privkey.pem;

    # Intestazioni di Sicurezza (Security Headers)
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Frame-Options SAMEORIGIN;

    # Caricamento di file di grandi dimensioni (essenziale per audio ad alta qualità)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1970; # Porta predefinita di TuneCamp
        proxy_http_version 1.1;

        # Intestazioni per il rilevamento corretto di IP e protocollo
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout prolungati per flussi audio di grandi dimensioni
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

## Passaggi Critici Post-Configurazione

### 1. Configura l'URL Pubblico
Assicurati che la variabile d'ambiente `TUNECAMP_PUBLIC_URL` sia impostata sul tuo dominio HTTPS:
```bash
TUNECAMP_PUBLIC_URL=https://tuo-dominio.com
```
*Nota: la federazione ActivityPub non funzionerà correttamente senza un URL pubblico HTTPS valido.*

### 2. Considerare Attendibile il Proxy (Trust Proxy)
TuneCamp è già configurato per considerare attendibili i proxy (tramite `app.set('trust proxy', true)`), il che gli consente di identificare correttamente l'IP originale dei visitatori leggendo l'intestazione `X-Forwarded-For`.

## Ottimizzare la Distribuzione Audio con X-Accel-Redirect (opzionale)

Di default, Node gestisce l'invio di ogni byte audio: legge il file e lo invia tramite il ciclo degli eventi (event loop). Su un'istanza con molto traffico, questo rende Node il collo di bottiglia per lo streaming. Puoi delegare l'invio fisico dei byte a Nginx: in questo modo Node si occuperà solo di autenticazione + decidere *quale* file servire, mentre Nginx gestirà lo streaming (con pieno supporto per la funzionalità HTTP Range).

Questa funzionalità è **opzionale** e richiede una configurazione di Nginx corrispondente — se abiliti il flag nell'applicazione senza definire i percorsi `internal` descritti sotto, lo streaming smetterà di funzionare.

### 1. Abilita la funzionalità in TuneCamp

```bash
TUNECAMP_XACCEL_REDIRECT=true
# Opzionale — modifica solo se cambi anche le location di nginx riportate sotto:
# TUNECAMP_XACCEL_MEDIA_PREFIX=/_protected_media
# TUNECAMP_XACCEL_CACHE_PREFIX=/_protected_cache
```

Quando abilitato, il server risponde alle richieste di streaming con un'intestazione `X-Accel-Redirect` che punta a un percorso interno, anziché convogliare direttamente il file.

### 2. Aggiungi i percorsi interni in Nginx

Aggiungi queste righe **all'interno del blocco `server { ... }`** (accanto a `location /`). I percorsi `alias` devono puntare alla tua cartella musicale `TUNECAMP_MUSIC_DIR` e alla cartella della cache di transcodifica (`TUNECAMP_TRANSCODE_CACHE_DIR`, che di default corrisponde a `<cartella-db>/cache/transcode`):

```nginx
    # File audio originali (mappa su TUNECAMP_MUSIC_DIR)
    location /_protected_media/ {
        internal;
        alias /percorso/della/tua/musica/;   # lo slash finale è obbligatorio
    }

    # Transcodifiche in cache (mappa su TUNECAMP_TRANSCODE_CACHE_DIR)
    location /_protected_cache/ {
        internal;
        alias /percorso/dei/tuoi/dati/cache/transcode/;   # lo slash finale è obbligatorio
    }
```

La direttiva `internal` significa che questi percorsi possono essere raggiunti solo tramite una richiesta `X-Accel-Redirect` proveniente dall'applicazione — non sono mai direttamente accessibili dai client, garantendo che l'autenticazione venga comunque eseguita da TuneCamp prima del reindirizzamento.

> **Nota:** Questo metodo ottimizza solo i file *locali*. Lo streaming da Google Drive, provider esterni e le transcodifiche in tempo reale (seek) continueranno a passare attraverso Node, come è giusto che sia. La **cache** di transcodifica (abilitata in modo indipendente) è ciò che rende la maggior parte degli stream transcodificati idonei all'ottimizzazione dopo la prima richiesta.

## Istruzioni Specifiche per CapRover

Se stai distribuendo TuneCamp tramite **CapRover**, segui questi passaggi per assicurarti che i WebSocket e i caricamenti di grandi dimensioni funzionino correttamente:

1. Vai alla scheda **Apps** e seleziona la tua app TuneCamp.
2. Fai clic su **Edit Default Nginx Config**.
3. Assicurati che le seguenti righe siano presenti all'interno del blocco `location /`:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   proxy_http_version 1.1;
   ```
4. Aumenta la dimensione massima del corpo richiesta (**Client Max Body Size**) per consentire il caricamento di file musicali ad alta qualità:
   ```nginx
   client_max_body_size 512M;
   ```
5. Aumenta i timeout per il **Motore Torrent (Torrent Engine)**:
   ```nginx
   proxy_read_timeout 600s;
   proxy_send_timeout 600s;
   ```
6. Salva e riavvia l'applicazione.
