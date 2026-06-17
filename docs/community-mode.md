# Diventare un artista & verifica vendite (`can_sell`)

> Nota storica: questo documento descriveva la "community mode" (`mode: community`), in cui ogni registrazione creava automaticamente un profilo artista pubblicante. Quel modello è stato rimosso: la pubblicazione aperta in stile Funkwhale non ha senso su TuneCamp, dove chi pubblica riceve pagamenti e serve quindi un rapporto diretto admin–artista. Resta il flusso di richiesta qui sotto e il gate di vendita `can_sell`.

## Il modello: vetrina curata

L'istanza è il negozio di un artista o di un'etichetta.

- Le registrazioni pubbliche (se abilitate) creano **listener** puri: ascoltano, comprano, creano playlist, commentano, ma non pubblicano.
- La pubblicazione (upload, release, asset in vendita, post social) richiede un account **con profilo artista collegato** (Curator/Manager, o un Listener in self-publish): è il link all'artista a concedere i diritti, non il ruolo (vedi [ROLES.md](ROLES.md)).
- Tutto ciò che è in vendita è stato messo lì da chi gestisce l'istanza, che ne risponde.

## Richiesta profilo artista

Per ridurre l'attrito del percorso listener → artista:

1. Il listener apre **Profile → Settings → Become an Artist** e preme *Request Artist Profile* (`POST /api/users/me/artist-request`).
2. **Approvazione manuale (default):** l'admin vede il badge "Artist requested" in **Admin → Users** e approva con un click (`POST /api/admin/system/users/:id/approve-artist`): viene creato un artista con il nome dell'utente, collegato al suo account, **e l'account è promosso a Curator**. La vendita resta disabilitata.
3. **Self-publish (opt-in dell'admin, setting `listenerSelfPublish`):** la richiesta viene **auto-approvata** senza click. L'account **mantiene il ruolo Listener** e riceve un profilo artista collegato — è il link all'artista, non il ruolo, a concedere i diritti di pubblicazione (`canPublishContent`). All'approvazione l'account riceve la quota di storage di default configurata (`listenerSelfPublishQuota`, MB, default 1 GB; `0` = illimitata), così può fare upload fisico sul server come gli altri. Unica differenza rispetto a un Curator: niente accesso alla libreria privata (Archive).
4. L'admin abilita la vendita separatamente quando ha verificato l'artista (vale per entrambi i percorsi).

L'approvazione (o l'opt-in self-publish a livello istanza) è il "contatto diretto admin–artista" che la pubblicazione richiede: significa prendersi la responsabilità di quell'artista sulla propria istanza.

## Vendita = artista verificato (`can_sell`)

La vendita non è una proprietà dell'istanza ma **del singolo artista**, tramite il flag `can_sell` sulla tabella `artists`:

- `can_sell = 1` (default per artisti creati manualmente prima della feature): prezzi e checkout funzionano normalmente.
- `can_sell = 0` (default per i profili approvati da richiesta): l'artista pubblica solo contenuti gratuiti.

L'enforcement è **lato server**, non solo UI:

1. **Checkout Stripe** (`POST /api/payments/stripe/create-session`) e **verifica on-chain** (`POST /api/payments/verify`) rifiutano con 403 gli item di artisti non abilitati.
2. **Creazione/modifica release** (`POST/PUT /api/releases`, `PUT /api/admin/releases/:id`): i campi prezzo vengono azzerati se l'artista non può vendere, così il catalogo non mostra mai un bottone Buy che il checkout rifiuterebbe.
3. Il toggle è modificabile **solo da Manager/Root Admin** ("Sales enabled" nell'editor artista) — un artista non può auto-abilitarsi.

Razionale: su una piattaforma che vende musica, l'upload libero senza verifica è un rischio legale (vendita di contenuti di cui l'uploader non possiede i diritti, chargeback, DMCA). Il gate di verifica sposta la responsabilità su una decisione esplicita dell'admin, come già fatto per i plugin di ingestione "grigi" (Soulseek/Torrent, disattivati di default).

## Note di migrazione

- Gli artisti esistenti hanno `can_sell = 1` (la migrazione usa DEFAULT 1): niente cambia per le istanze attuali.
- Il setting `mode` non viene più letto da nessuna parte: le istanze che lo avevano impostato a `community` tornano al comportamento standard alla prossima release. I profili artista auto-creati restano collegati: poiché la pubblicazione è gata sul **link all'artista** e non sul ruolo, quegli account (ruolo `user` con `artist_id`) **possono pubblicare** senza promozione a Curator — coerente con la modalità self-publish.
- Il toggle "Public Registration" nelle impostazioni admin ora funziona davvero: scriveva `allowPublicRegistration` mentre la registrazione controllava la chiave legacy `allowRegistration` (il check ora le legge entrambe).
