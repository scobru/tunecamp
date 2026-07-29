# Sistema Karma — Accantonato

Valutato come sistema di reputazione/valuta per-istanza (ledger event-sourced, hook di guadagno/spesa, attivatore admin). **Decisione: non proseguire.** L'unico problema reale che avrebbe risolto — evidenziare che un utente sta effettuando un buon seeding/sharing su Sidecamp — non richiede un libro mastro, un'economia di spesa e modifiche coordinate tra `tunecamp` + `sidecamp` (+ eventualmente `tunecamp-sso`/`tunecamp-website` per una classifica cross-istanza). Una semplice statistica in sola lettura ("ha condiviso X GB in Y ore") ottiene lo stesso valore a una frazione della superficie ingegneristica, senza le problematiche anti-abuso e i rischi di "paga per aumentare la visibilità" che un'economia di spesa solleva su un catalogo orientato agli artisti.

Nessun codice per il karma è mai stato unito nei rami principali (`karma_ledger`, `karmaService`, `/api/karma/*` non sono mai esistiti in `src/` o `webapp/src/`), quindi non c'è nulla da ripristinare in tal senso.

## SSO Cross-istanza (inizialmente pianificato come prerequisito per karma/classifica)

I componenti lato istanza realizzati a questo scopo (`POST /api/oauth/authorize` in `tunecamp`, la pagina di passaggio `webapp/src/pages/SsoAuthorize.tsx` e la configurazione `ssoRedirectUris`/`TUNECAMP_SSO_REDIRECT_URIS`) sono stati **rimossi da questo repository** insieme al karma, poiché il loro unico scopo era alimentare una classifica cross-istanza che non verrà implementata.

Il servizio autonomo `tunecamp-sso` (repository separato) rimane inalterato e conserva un'implementazione funzionante di `/auth/start` + `/auth/callback` con verifica delle asserzioni reale — è semplicemente una controparte isolata ora che il lato `tunecamp` con cui comunicava non esiste più. Il suo `README.md` indica che il lato istanza non è ancora sviluppato; questo è ora doppiamente obsoleto (lo era già prima di questa modifica, dato che il lato istanza era esistito solo brevemente). Nessuna azione richiesta a meno che il servizio stesso non venga riadattato per altri scopi.
