# Roadmap TuneCamp

Piano di miglioramento basato sull'analisi comparativa con Funkwhale (giugno 2026).
Obiettivo: core pulito e veloce orientato alla vendita diretta, funzionalità "grigie" isolate in plugin opzionali.

Lavori completati: vedi [DONE.md](DONE.md).

## Follow-up dalla security review pagamenti

Finding aperti in `docs/security-review-payments.md` (i due High sono già corretti):

- **#3 (Medium)**: verificare l'importo della label fee, non solo il destinatario.
- **#4 (Medium)**: `/verify` deve risolvere il prezzo effettivo come fa il percorso Stripe (override `release_tracks`).
- **#5 (Medium)**: documentare/verificare l'assunzione di fiducia sul contratto checkout per `purchaseWithUSDC`.
- **#6-8 (Low)**: token JWT in query string, validazione `successUrl`/`cancelUrl`, rate limit dedicato sulle route di verify.

## Deciso di NON fare

- **Rimuovere il multi-utente**: nessun guadagno di velocità reale, perdita del caso d'uso etichette.
- **Chat integrata**: da rimuovere o congelare — pesante e fuori dal core "vendi la tua musica".
- **SFU (LiveKit/mediasoup) per la live**: latenza migliore ma è il tipo di componente infrastrutturale che TuneCamp vuole evitare; HLS è sufficiente.
