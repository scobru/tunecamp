# Roadmap TuneCamp

Piano di miglioramento basato sull'analisi comparativa con Funkwhale (giugno 2026).
Obiettivo: core pulito e veloce orientato alla vendita diretta, funzionalità "grigie" isolate in plugin opzionali.

Lavori completati: vedi [DONE.md](DONE.md).

## Follow-up dalla security review pagamenti

Resta aperto in `docs/security-review-payments.md` (tutti gli altri finding sono corretti):

- **#5 (Medium, accettato e documentato)**: verifica opzionale via RPC del price mapping del contratto checkout per `purchaseWithUSDC` — richiede contratto admin malevolo per essere sfruttato.

Pattern analogo fuori scope pagamenti (da valutare): `?token=` con JWT di sessione è usato anche da `/api/tracks/:id/download`, dai link di backup admin e dallo stream chat — candidati alla stessa migrazione a token `dt`.

## Deciso di NON fare

- **Rimuovere il multi-utente**: nessun guadagno di velocità reale, perdita del caso d'uso etichette.
- **Chat integrata**: da rimuovere o congelare — pesante e fuori dal core "vendi la tua musica".
- **SFU (LiveKit/mediasoup) per la live**: latenza migliore ma è il tipo di componente infrastrutturale che TuneCamp vuole evitare; HLS è sufficiente.
