# Diventare un artista & verifica vendite (`can_sell`)

> Nota storica: questo documento descriveva la "community mode" (`mode: community`), in cui ogni registrazione creava automaticamente un profilo artista pubblicante. Quel modello è stato rimosso: la pubblicazione aperta in stile Funkwhale non ha senso su TuneCamp, dove chi pubblica riceve pagamenti e serve quindi un rapporto diretto admin–artista. Resta il flusso di richiesta qui sotto e il gate di vendita `can_sell`.

## Il modello: vetrina curata

L'istanza è il negozio di un artista o di un'etichetta.

- Le registrazioni pubbliche (se abilitate) creano **listener** puri: ascoltano, comprano, creano playlist, commentano, ma non pubblicano.
- La pubblicazione (upload, release, asset in vendita, post social) richiede un account **Curator o superiore con profilo artista collegato** (vedi [ROLES.md](ROLES.md)).
- Tutto ciò che è in vendita è stato messo lì da chi gestisce l'istanza, che ne risponde.

## Richiesta profilo artista

Per ridurre l'attrito del percorso listener → artista:

1. Il listener apre **Profile → Settings → Become an Artist** e preme *Request Artist Profile* (`POST /api/users/me/artist-request`).
2. L'admin vede il badge "Artist requested" in **Admin → Users** e approva con un click (`POST /api/admin/system/users/:id/approve-artist`): viene creato un artista con il nome dell'utente, collegato al suo account, **e l'account è promosso a Curator**. La vendita resta disabilitata.
3. L'admin abilita la vendita separatamente quando ha verificato l'artista.

L'approvazione è esattamente il "contatto diretto admin–artista" che la pubblicazione richiede: approvare significa prendersi la responsabilità di quell'artista sulla propria istanza.

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
- Il setting `mode` non viene più letto da nessuna parte: le istanze che lo avevano impostato a `community` tornano al comportamento standard alla prossima release. I profili artista auto-creati restano collegati, ma quegli account (ruolo `user`) non possono più pubblicare finché l'admin non li promuove a Curator.
- Il toggle "Public Registration" nelle impostazioni admin ora funziona davvero: scriveva `allowPublicRegistration` mentre la registrazione controllava la chiave legacy `allowRegistration` (il check ora le legge entrambe).
