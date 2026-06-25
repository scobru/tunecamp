# Monitoraggio e Allarmi

TuneCamp dispone di due sistemi di monitoraggio integrati: un endpoint HTTP per lo stato di salute (health check) e la segnalazione dei crash opzionale tramite Sentry. Insieme a un controllo di uptime esterno, coprono le due domande fondamentali in produzione: *"l'istanza è attiva?"* e *"cosa si è rotto?"*.

## Endpoint di Stato (Health Endpoint)

La richiesta `GET /health` restituisce il codice `200` quando il server HTTP risponde correttamente. Questo endpoint viene registrato prima del middleware di federazione, pertanto un blocco in un'integrazione non può comprometterne il funzionamento. L'immagine Docker lo utilizza già per il proprio `HEALTHCHECK`.

## Pannello Risorse di Sistema (Admin → System)

Gli amministratori root hanno a disposizione una dashboard in tempo reale all'indirizzo **Admin Panel → System**, alimentata dall'endpoint `GET /api/admin/system/resources`. Consente di rispondere alla domanda: *"quanto sta consumando la mia istanza in questo momento, e c'è qualche leak?"* senza dover accedere alla console del server.

Il pannello effettua una richiesta ogni 5 secondi e mostra:

- **CPU del Processo %** — Calcolata lato client a partire dalle differenze successive di `process.cpuUsage()`, normalizzata su tutti i core. Mostra anche il carico di sistema medio (su Linux; `0` su Windows) e il numero di core.
- **Memoria Heap utilizzata / totale, RSS, memoria esterna** — Tramite `process.memoryUsage()`.
- **Grafico di andamento (sparkline) di Heap e RSS** negli ultimi ~5 minuti. Una linea che sale costantemente senza mai scendere dopo la Garbage Collection (GC) indica un classico memory leak; il parametro RSS rappresenta ciò che il kernel monitora prima di forzare un arresto OOM (exit code 137).
- **RAM dell'Host** utilizzata rispetto al totale (`os.totalmem/freemem`).
- **Dimensione del file DB SQLite** — Ottenuta con una chiamata `stat` economica, per non appesantire le richieste frequenti. (Per un'analisi dettagliata dello spazio occupato dalla musica sul disco, usa la scheda **Storage** — questa effettua una scansione reale della cartella ed è volutamente attivabile solo su richiesta).
- **Attività in background attive** — Elenco in tempo reale dal componente `TaskManager` (scansioni, controlli, sincronizzazione dei tag, ecc.) con relativo avanzamento.

Questo endpoint è strutturato per essere molto leggero (nessuna scansione del disco) così da non generare carico sul server a causa del polling frequente. L'accesso è limitato ai ruoli con permessi `MANAGE_SYSTEM` (amministratore root).

## Segnalazione dei Crash (Sentry)

Opzionale: imposta la variabile d'ambiente `SENTRY_DSN` e riavvia il server. Se non configurata (comportamento di default), l'SDK non viene inizializzato e nessun dato viene inviato.

```bash
# File .env o ambiente del tuo container
SENTRY_DSN=https://xxxx@oXXXX.ingest.sentry.io/XXXX
```

Funziona sia con [sentry.io](https://sentry.io) (il piano gratuito è sufficiente per un'istanza singola) che con qualsiasi backend compatibile con Sentry ospitato autonomamente, come [GlitchTip](https://glitchtip.com).

Cosa viene catturato:

- **Eccezioni non gestite (uncaught exceptions) e promesse rifiutate non gestite (unhandled rejections)** nel processo principale. Il modulo si occupa solo della cattura — la logica fatale/non-fatale in `src/index.ts` decide comunque se arrestare il processo.
- **Errori di rotta non gestiti** tramite il gestore degli errori di Express (la risposta JSON di errore inviata ai client rimane inalterata).

Variabili opzionali:

| Variabile | Valore Predefinito | Scopo |
|---|---|---|
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | Tag dell'ambiente per gli eventi |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Tracciamento delle prestazioni; `0` = solo errori |
| `TUNECAMP_GIT_SHA` | impostato dalla compilazione Docker | Tag della release, associa gli errori a una specifica build |

Su CapRover il tag di release viene valorizzato in automatico leggendo `CAPROVER_GIT_COMMIT_SHA` durante la compilazione.

In Sentry, abilita una regola di allarme ("Invia una notifica per i nuovi problemi") per ricevere un'email alla prima occorrenza di ogni nuovo errore.

## Controllo di Uptime (Esterno)

Un sistema di segnalazione dei crash non può avvisarti se l'intera macchina o il container sono spenti — a questo scopo è necessario un pinger esterno. Ciascuno di questi servizi gratuiti è adatto:

- [UptimeRobot](https://uptimerobot.com) — Monitor HTTP(s)
- [healthchecks.io](https://healthchecks.io)
- [Better Stack](https://betterstack.com/uptime)

Configurazione: monitora `https://tua-istanza.esempio.com/health`, intervallo 1–5 minuti, allarmi via email/Telegram. La risposta attesa è `200 OK`.

## Arresti OOM su Docker Swarm / CapRover

Swarm *sostituisce* le attività non integre o arrestate per mancanza di memoria (OOM) anziché riavviarle, per cui un container andato in crash scompare dal comando `docker ps`. Per diagnosticare:

```bash
docker service ps <nome-servizio> --no-trunc   # exit code dei task terminati
# "task: non-zero exit (137)" = arrestato per mancanza di memoria (OOM)
docker service logs <nome-servizio> --since 1h
```

Il codice di uscita (exit code) 137 indica che il kernel ha terminato il processo per aver superato il limite di memoria assegnato — aumenta la memoria riservata al servizio o controlla su Sentry cosa stava allocando risorse subito prima dell'arresto.
