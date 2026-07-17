# Karma System — Design

Per-instance reputation/currency, event-sourced. Not a contatore semplice: serve audit trail e capacità di reverse (abuso, bug, admin override).

## Fase 0 — fondamenta

- Tabella `karma_ledger`: `user_id, delta, reason, source_action, ref_id, created_at`. Append-only.
- `karmaService`: `award(userId, action, amount, meta)`, `spend(userId, cost, meta)`, `getBalance(userId)` — balance = SUM(delta), non colonna denormalizzata (evita drift).
- Toggle admin in Settings → Customize Modules → "Enable Karma", stesso pattern usato da Sidecamp/Federation toggle esistenti.

## Fase 1 — earn hooks

- Tunecamp server: hook su eventi già esistenti in `src/server/routes/admin/admin.ts` (creazione utente via `POST /system/users` → `authService.createUser`) e upload/release completato. Nota: **non esiste self-service signup** (solo `/auth/setup` per il primo admin + creazione utenti da admin panel) — quindi "referral bonus" karma va agganciato alla creazione utente lato admin, non a un signup pubblico.
- Sidecamp: stato peer-sharing/seeding vive server-side via `src/server/modules/peer/peer.ws.ts` (tunnel WebSocket + heartbeat). Un job periodico sul server calcola karma da uptime/tracce condivise leggendo quello stato — Sidecamp stesso non calcola karma, solo fetch/display. Single source of truth resta il server: calcolo lato client sarebbe manipolabile.

## Fase 2 — spend hooks

- `POST /api/karma/spend` generico + tabella costi per azione (priority_queue, storage_boost, visibility_boost).
- Wire su: coda import peer-federation, controllo quota storage, ranking Network/Discovery.

## Fase 3 — UI

- Tunecamp webapp: balance widget + history + bottoni spend inline (es. "Boost" su release).
- Sidecamp: solo display balance read-only, toast "+N karma" durante sharing attivo.
- tunecamp-website: skip per ora — sito statico, zero account utente, vedi sezione SSO sotto.

## Fase 4 — anti-abuse

- Rate-limit earn lato server (l'intervallo di heartbeat già limita il seeding-karma).
- Ledger append-only, tool admin per annullare entry (nuova entry con delta negativo, mai delete).

## Nota: SSO cross-istanza (prerequisito per karma/leaderboard aggregato su tunecamp.org) — STATO: lato istanza fatto

tunecamp-website è oggi statico (Tailwind, nessun backend) — karma qui ha senso solo se si vuole un leaderboard/directory aggregato cross-istanza, non necessario per il karma interno per-istanza sopra.

Pattern "Sign in with your instance", implementato tramite servizio standalone `tunecamp-sso` (Node/Express separato, stato server-side per pending login + verifica assertion) + due pezzi nel repo `tunecamp`:

1. Utente su tunecamp.org inserisce il dominio della sua istanza → `tunecamp-sso`'s `GET /auth/start?instance=&return_to=`.
2. `tunecamp-sso` reindirizza a `https://<istanza>/oauth/authorize?client_id=&redirect_uri=&state=`.
3. **Fatto** — `webapp/src/pages/SsoAuthorize.tsx` intercetta la rotta, aspetta la sessione locale, chiama **`POST /api/oauth/authorize`** (`src/server/routes/network/oauth-authorize.ts`).
4. **Fatto** — l'endpoint firma `actorUrl\nstate\niat` con la chiave privata dell'actor (artista o utente, stessa infra AP: `artist.private_key` / `admin.ap_private_key`), redirect_uri validato contro allowlist `ssoRedirectUris` (env `TUNECAMP_SSO_REDIRECT_URIS`), poi risponde `{ redirectUrl }` col quale la SPA fa `window.location`.
5. `tunecamp-sso` verifica la firma con la chiave pubblica dell'actor (fetch da `actorUrl`, documento ActivityPub) e riemette un proprio JWT di sessione, redirect a `return_to?token=`.

Non ancora fatto (lato tunecamp-website): pagina/bottone che avvia il passo 1 e pagina di callback che legge `?token=` e lo salva — nessun backend serve per questo, il sito resta statico. Nessuna aggregazione karma reale finché karma per-istanza (Fase 0-4 sopra) non esiste: oggi il login SSO autentica l'identità, non trasporta karma.

**Ordine**: karma prima (self-contained, valore immediato anche senza SSO); SSO instance-side già pronto in anticipo; il leaderboard/directory cross-istanza resta bloccato su karma Fase 0-4.
