# Funzionalità Social: Post e Commenti

TuneCamp include uno strato social che consente agli artisti di interagire con i propri fan e agli utenti di lasciare recensioni e commenti sulle tracce.

## 1. Post dell'Artista

Gli amministratori possono pubblicare post nel feed della propria istanza.
- **Contenuto**: Supporta testo, link e tracce incorporate.
- **Federazione**: I post vengono federati automaticamente tramite **ActivityPub**, rendendoli visibili ai follower presenti su altre istanze TuneCamp o su Mastodon/Pleroma.
- **Gestione**: Gli amministratori utilizzano la scheda "Community" del pannello di controllo per creare ed eliminare i post.

## 2. Sistema di Commenti

Gli utenti possono lasciare commenti sulle singole tracce per esprimere opinioni o discutere dei brani.
- **Autenticazione**: Per inserire commenti è necessario disporre di un account utente registrato.
- **Moderazione**:
  - Gli amministratori possono eliminare qualsiasi commento.
  - Gli utenti possono eliminare i propri commenti.
- **API**:
  - `GET /api/comments/:trackId`: Recupera tutti i commenti relativi a una traccia.
  - `POST /api/comments`: Aggiunge un nuovo commento.

## 3. Feed di Coinvolgimento (Feed)

La sezione principale "Feed" unisce i post degli artisti locali con le interazioni social (like, condivisioni) provenienti dalla rete federata.
- **Implementazione**: Gestito dal social manager (`src/server/core/managers/social.ts`, basato su `social.repository.ts`); i post sono esposti tramite `src/server/routes/network/activitypub.ts` e i commenti tramite `src/server/routes/network/comments.ts`.

## 4. Identità Federata

Ogni **artista** in TuneCamp corrisponde a un **Attore ActivityPub** (di tipo "Person") — la federazione avviene a livello di artista, non per singolo account utente.
- Profilo: `https://tuo-dominio.com/actor/@nomeutente`
- Le attività in uscita sono firmate con la **coppia di chiavi RSA a 4096 bit** dell'artista, generata automaticamente per ciascun profilo.

> Nota: le versioni precedenti collegavano l'identità a coppie di chiavi Zen (SEA). Questa integrazione è stata rimossa — l'autenticazione avviene tramite nome utente/password (JWT) e la firma per la federazione si basa su chiavi RSA. Vedi [FEDERATION.md](./FEDERATION.md).
