# Diventare un Artista e Verifica delle Vendite (`can_sell`)

> **Nota Storica:** Questo documento descriveva in precedenza la "modalità community" (`mode: community`), in cui ogni registrazione creava automaticamente un profilo artista per la pubblicazione. Quel modello è stato rimosso: la pubblicazione aperta in stile Funkwhale non è adatta a TuneCamp, dove gli editori ricevono pagamenti diretti, richiedendo di conseguenza un rapporto diretto tra amministratore e artista. Rimangono attivi il flusso di richiesta descritto di seguito e il gate di vendita `can_sell`.

## Il Modello: Vetrina Curata

L'istanza rappresenta il negozio di un artista o di un'etichetta.

- Le registrazioni pubbliche (se abilitate) creano semplici **ascoltatori**: ascoltano, acquistano, creano playlist e commentano, ma non pubblicano.
- La pubblicazione (caricamento di musica, creazione di release, articoli in vendita, post social) richiede un account con livello **Curatore o superiore** collegato a un profilo artista (vedi [ROLES.md](./ROLES.md)).
- Tutto ciò che è in vendita è stato inserito dall'amministratore dell'istanza, che ne è il responsabile legale.

## Richiesta Profilo Artista

Per ridurre l'attrito nel percorso da ascoltatore a artista:

1. L'ascoltatore apre **Profile → Settings → Become an Artist** e fa clic su *Richiedi Profilo Artista* (`POST /api/users/me/artist-request`).
2. L'amministratore vede il contrassegno "Artist requested" in **Admin → Users** e lo approva con un clic (`POST /api/admin/system/users/:id/approve-artist`): viene creato un artista con il nome dell'utente e collegato al suo account. **L'account mantiene il ruolo `user`** — è il collegamento al profilo artista a concedere i diritti di pubblicazione (è lo stato "Ascoltatore-Artista"; vedi [ROLES.md](ROLES.md)), quindi non avviene alcuna promozione a Curatore. Le vendite rimangono disabilitate. (Con **Listener Self-Publish** attivo in Admin → Settings, questo passaggio di approvazione viene saltato e la richiesta è auto-approvata.)
3. L'amministratore abilita le vendite separatamente una volta verificato l'artista.

L'approvazione rappresenta proprio quel "contatto diretto amministratore-artista" richiesto per la pubblicazione: approvare significa assumersi la responsabilità di quell'artista sulla propria istanza.

## Vendite = Artista Verificato (`can_sell`)

Le vendite non sono una proprietà dell'istanza ma **del singolo artista**, tramite il flag `can_sell` presente nella tabella `artists`:

- `can_sell = 1` (valore predefinito per gli artisti creati manualmente prima dell'introduzione di questa funzionalità): i prezzi e il checkout funzionano normalmente.
- `can_sell = 0` (valore predefinito per i profili approvati tramite richiesta): l'artista può pubblicare esclusivamente contenuti gratuiti.

Il blocco viene applicato **lato server**, non solo sull'interfaccia utente:

1. **Stripe Checkout** (`POST /api/payments/stripe/create-session`) e la **verifica on-chain** (`POST /api/payments/verify`) rifiutano gli articoli degli artisti disabilitati restituendo un errore HTTP 403.
2. **Creazione/modifica delle release** (`POST/PUT /api/releases`, `PUT /api/admin/releases/:id`): i campi del prezzo vengono azzerati se l'artista non è abilitato a vendere, così che il catalogo non mostri mai un pulsante "Acquista" che verrebbe poi rifiutato in fase di pagamento.
3. L'opzione può essere **modificata solo da un Manager/Root Admin** (casella "Vendite abilitate" nell'editor dell'artista) — un artista non può auto-abilitarsi.

Razionale: su una piattaforma che consente la vendita di musica, i caricamenti aperti senza verifica rappresentano un rischio legale (vendita di contenuti per i quali chi effettua il caricamento non detiene i diritti, chargeback, segnalazioni DMCA). Il gate di verifica sposta la responsabilità a una decisione esplicita dell'amministratore, similmente a quanto già fatto per i plugin di acquisizione "grigi" (Soulseek/Torrent, disabilitati per impostazione predefinita).

## Note sulla Migrazione

- Gli artisti esistenti hanno `can_sell = 1` (la migrazione utilizza il valore predefinito 1): non cambia nulla per le istanze attuali.
- L'impostazione `mode` non viene più letta da nessuna parte: le istanze che la avevano impostata su `community` torneranno al comportamento standard a partire dalla prossima versione. I profili artista creati automaticamente rimangono collegati, e tali account (con ruolo `user`) possono pubblicare tramite quel collegamento al profilo artista (il modello Ascoltatore-Artista) — non è richiesta alcuna promozione a Curatore.
- La casella "Registrazione Pubblica" nelle impostazioni amministratore ora funziona correttamente: in precedenza scriveva `allowPublicRegistration` mentre la registrazione controllava la chiave legacy `allowRegistration` (ora il controllo verifica entrambe).
