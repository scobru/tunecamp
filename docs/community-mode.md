# Modalità Istanza: Label vs Community

TuneCamp supporta due modalità di istanza, configurabili da **Admin → Site Settings → Instance Mode** (setting `mode`).

## `label` (default) — Vetrina curata

Il modello classico TuneCamp: l'istanza è il negozio di un artista o di un'etichetta.

- Le registrazioni pubbliche (se abilitate) creano **listener** puri: ascoltano, comprano, creano playlist, ma non pubblicano.
- Gli artisti vengono creati e collegati dall'admin, oppure tramite il flusso di richiesta (vedi sotto).
- Tutto ciò che è in vendita è stato messo lì da chi gestisce l'istanza, che ne risponde.

## `community` — Pubblicazione aperta

Un modello "Funkwhale-lite" con monetizzazione opt-in, pensato per collettivi e community:

- Ogni nuova registrazione crea **automaticamente un profilo artista** collegato all'utente (quota storage 1 GB di default).
- L'utente può caricare e pubblicare la propria musica subito, **ma solo gratuitamente**: il profilo nasce con `can_sell = 0`.
- I permessi restano **owner-scoped**: un community artist vede il contenuto pubblico più il proprio, e può modificare solo il proprio. Non ha alcun accesso da Curator/Manager.

## Vendita = artista verificato (`can_sell`)

La vendita non è una proprietà dell'istanza ma **del singolo artista**, tramite il flag `can_sell` sulla tabella `artists`:

- `can_sell = 1` (default per artisti creati manualmente prima della feature): prezzi e checkout funzionano normalmente.
- `can_sell = 0` (default per artisti auto-creati in community mode e per i profili approvati da richiesta): l'artista pubblica solo contenuti gratuiti.

L'enforcement è **lato server**, non solo UI:

1. **Checkout Stripe** (`POST /api/payments/stripe/create-session`) e **verifica on-chain** (`POST /api/payments/verify`) rifiutano con 403 gli item di artisti non abilitati.
2. **Creazione/modifica release** (`POST/PUT /api/releases`, `PUT /api/admin/releases/:id`): i campi prezzo vengono azzerati se l'artista non può vendere, così il catalogo non mostra mai un bottone Buy che il checkout rifiuterebbe.
3. Il toggle è modificabile **solo da Manager/Root Admin** ("Sales enabled" nell'editor artista) — un artista non può auto-abilitarsi.

Razionale: su una piattaforma che vende musica, l'upload libero senza verifica è un rischio legale (vendita di contenuti di cui l'uploader non possiede i diritti, chargeback, DMCA). Il gate di verifica sposta la responsabilità su una decisione esplicita dell'admin, come già fatto per i plugin di ingestione "grigi" (Soulseek/Torrent, disattivati di default).

## Richiesta profilo artista (label mode)

Per ridurre l'attrito del percorso listener → artista in label mode:

1. Il listener apre **Profile → Settings → Become an Artist** e preme *Request Artist Profile* (`POST /api/users/me/artist-request`).
2. L'admin vede il badge "Artist requested" in **Admin → Users** e approva con un click (`POST /api/admin/system/users/:id/approve-artist`): viene creato un artista con il nome dell'utente, collegato al suo account, con vendita disabilitata.
3. L'admin abilita la vendita separatamente quando ha verificato l'artista.

Il ruolo dell'utente resta `user`: il caricamento funziona tramite il collegamento all'artista e resta limitato al proprio contenuto.

## Note di migrazione

- Gli artisti esistenti hanno `can_sell = 1` (la migrazione usa DEFAULT 1): niente cambia per le istanze attuali.
- Il toggle "Public Registration" nelle impostazioni admin ora funziona davvero: scriveva `allowPublicRegistration` mentre la registrazione controllava la chiave legacy `allowRegistration` (il check ora le legge entrambe).
