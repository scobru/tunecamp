# Chat e Messaggistica in Tempo Reale

TuneCamp include un sistema integrato di chat di community in tempo reale e messaggistica diretta cifrata end-to-end (E2EE). Consente a fan, artisti e membri dell'istanza di comunicare direttamente dall'applicazione web o tramite client desktop/daemon come **Sidecamp**.

---

## 1. Architettura Principale

Il sistema di chat si basa su un trasporto WebSocket leggero e sulla persistenza locale in SQLite, integrando la cifratura end-to-end opzionale lato client per le conversazioni private 1-a-1.

- **Trasporto WebSocket**: Le connessioni avvengono tramite la rotta `/ws/chat` (separata dal trasporto di peer sharing `/ws/peer`).
- **Servizio Backend**: Gestito da `ChatService` (`src/server/modules/chat/chat.service.ts`).
- **Persistenza nel Database**:
  - `chat_messages`: Memorizza la cronologia dei messaggi della lobby pubblica.
  - `chat_rooms`: Stanze multi-utente con nome. Oltre all'`id` locale (un `AUTOINCREMENT` per-istanza) ogni stanza ha un UUID `global_id` generato una sola volta dall'istanza che l'ha creata: è l'unico identificatore valido tra istanze diverse.
  - `chat_room_members`: Iscrizioni alle stanze, chiave `(room_id, username)`.
  - `chat_room_messages`: Cronologia delle stanze (in chiaro: le stanze non sono E2EE, per scelta — vedi *Stanze*).
  - `peer_chat_bans`: Ban persistenti per IP / utente per la moderazione.
  - `peer_chat_mutes`: Elenco persistente degli utenti silenziati.
- **Libreria Client**: Pacchetto indipendente `@tunecamp/chat` (`tunecamp-chat`), che fornisce la classe `TuneCampChatClient` e l'hook React `useTuneCampChat`.

---

## 2. Modalità di Funzionamento

### Chat della Lobby Community
- **Pubblica e Persistente**: Trasmessa a tutti gli utenti connessi nella lobby dell'istanza.
- **Backlog della Cronologia**: Caricato automaticamente alla connessione tramite `GET /api/chat/history`.
- **Etichette di Dominio**: Aggiunge automaticamente il tag di dominio dell'istanza ai nickname in ambienti federati o multi-istanza (es. `artista (sudorecords)`).

### Messaggi Diretti Cifrati (E2EE)
- **DM Privati 1-a-1**: I messaggi privati tra due utenti vengono cifrati lato client con **Zen SEA** — identità a curva ellittica (secp256k1). I messaggi vengono cifrati con un segreto condiviso derivato via ECDH (`Zen.secret` + `Zen.encrypt`/`Zen.decrypt`).
- **La chiave dei DM è l'identità Zen dell'account**, lo stesso `zen_pub` usato da FID per l'SSO cross-instance — non una coppia dedicata alla chat. È questo che rende verificabile una chiave pubblica scaricata: appartiene all'account, non al socket collegato in quel momento.
- **Coppia casuale, vault sigillato con la password**: la coppia viene generata a caso e poi cifrata lato client con la password dell'utente (`encryptPairVault`) e caricata su `POST /api/auth/zen/keys` come `zen_priv`. *Non* è derivata dalla password: una coppia derivata diventerebbe silenziosamente un'identità diversa a ogni cambio password. Il server conserva il vault in modo opaco e non può aprirlo.
- **La password del vault viene stirata prima di arrivare al cifrario**: PBKDF2-HMAC-SHA256, 600 000 iterazioni, salt casuale da 16 byte. `Zen.encrypt` da sola deriva la chiave AES con un singolo SHA-256, il che mette un attaccante offline in possesso di un dump del database a miliardi di tentativi al secondo dall'identità di ogni utente. Il formato è `tcv1:<iterazioni>:<saltHex>:<blobZen>`, così il costo si può alzare in futuro senza invalidare i vault esistenti; un blob che dichiara meno di 100 000 iterazioni viene rifiutato, altrimenti sarebbe il server a scegliere un costo che sa forzare. I vault precedenti all'envelope si aprono ancora (`isLegacyPairVault`) e vengono ri-sigillati al login successivo, l'unico momento in cui il client ha la password.
- **Provisioning**: alla registrazione, e al login con password per un account che non ha ancora un'identità, la webapp genera la coppia e carica il vault. Se l'account ha già un `zen_pub` ma nessun vault (identità collegata dal portale FID, metà privata mai caricata), il client *non* genera una seconda coppia: rinuncia all'E2EE invece di sdoppiare l'account in due identità.
- **Il cambio password deve ri-sigillare**: il vault resta cifrato con la vecchia password finché non viene rincartato, quindi ogni percorso di cambio password chiama `resealChatIdentity(newPassword)` (`useAuthStore.ts`). Saltarlo chiude fuori l'utente dalla propria identità e da tutti i DM indirizzati a essa. `POST /api/auth/zen/set` (ricollegamento a un'identità diversa) azzera `zen_priv` per lo stesso motivo: un vault obsoleto accoppierebbe una nuova chiave pubblica a una chiave privata che non le corrisponde.
- **Relay a Zero Fiducia**: Il server TuneCamp funge unicamente da relay opaco per le chiavi pubbliche e il testo cifrato. **Non vede mai il contenuto in chiaro dei DM**.
- **Origine della chiave dichiarata e a prova di downgrade**: `GET /api/chat/pubkey/:username` restituisce `source: "identity"` quando la chiave viene dall'account e `source: "session"` quando viene solo da un annuncio su socket attivo. Il client (`@tunecamp/chat`) ricorda quale ha ricevuto e non permette a una chiave di sessione annunciata via WebSocket di sovrascrivere una chiave d'identità già risolta.
- **Pinning del fingerprint (TOFU)**: è il server a decidere quale chiave consegnare, quindi possedere una chiave non dimostra nulla su chi ne sia il proprietario. Il client fissa `SHA-256(pub)` troncato a 128 bit la prima volta che vede un peer (`keyFingerprint`, persistito per peer id) e **rifiuta** qualunque chiave successiva con hash diverso: la vecchia resta in vigore, la nuova finisce in quarantena e scatta `onKeyChange`. Solo `acceptPeerKeyChange(peerId)`, azionato da un'azione esplicita dell'utente dopo il confronto dei fingerprint fuori banda, ri-fissa il pin. Senza quel confronto, un peer che ha davvero ruotato la chiave è indistinguibile da un'intercettazione.
- **Un DM non parte mai in chiaro**: se non c'è una chiave utilizzabile per il destinatario — nessuna pubblicata, oppure una messa in quarantena dal controllo del pin — `sendMessage` rifiuta e lo dichiara, invece di ripiegare su un testo in chiaro che il mittente non ha modo di notare. Trattenere una chiave è qualcosa che il server può fare a piacimento, quindi il ripiego in chiaro sarebbe un downgrade sotto il suo pieno controllo.
- **Persistenza della coppia di chiavi**: La coppia aperta viene memorizzata in `localStorage` per utente (`useAuthStore.ts`), così sopravvive ai ricaricamenti di pagina senza la password, che non viene tenuta in memoria.

### Stanze (Rooms)
- **Conversazioni multi-utente con nome**, separate dall'unica lobby globale. L'iscrizione è legata allo *username*, non al socket: chi entra dalla webapp resta membro anche dal proprio daemon Sidecamp e dopo una riconnessione.
- **Gestite via REST** (`/api/chat/rooms*`, tutte dietro `authMiddleware.requireUser`) e usate via WebSocket (`room_join`, `room_leave`, `room_chat`). L'utente che agisce viene sempre preso dalla sessione autenticata, mai da un parametro di query.
- **La cancellazione è riservata al creatore**; le stanze private (`is_private`) sono visibili solo ai membri.
- **Non sono E2EE: è una decisione, non una dimenticanza.** I messaggi delle stanze vengono salvati e inoltrati in chiaro, a differenza dei DM. Non usare una stanza per contenuti che richiedono il modello di minaccia dei DM.

  Una stanza è uno spazio moderato: un admin dell'istanza può svuotarne lo storico, un moderatore interviene su ciò che è stato scritto, e lo storico viene servito a chi entra dopo — anche a membri che non erano presenti. Tutto questo richiede che il server legga i messaggi. Un E2EE di gruppo dovrebbe inoltre stabilire chi detiene la chiave, come arriva a un membro che entra un anno dopo, e cosa succede allo storico quando qualcuno viene rimosso: un problema di gestione delle chiavi, non di cifrario. Le due cose sono in reale tensione, e risolverla non è lavoro da singola release. Le stanze sono quindi in chiaro di proposito, e documentate come tali, perché nessuno le scambi per private. I DM restano cifrati end-to-end e non moderabili: è questo lo scambio, deliberato da entrambe le parti.

### Chat Federata (Cross-Instance)
- **Relay della lobby**: I messaggi pubblici della lobby vengono trasmessi a ogni istanza peer federata conosciuta e iniettati nella loro lobby locale, taggati con l'istanza di origine del mittente.
- **DM cross-instance**: Inviare a `utente@istanza` risolve l'istanza target tramite `federatedDiscoveryService.resolvePeerByInstance()` e consegna il messaggio a quel singolo peer (non in broadcast).
- **Messaggi di stanza federati**: I messaggi di una stanza pubblica vengono diffusi a tutti i peer, indirizzati tramite il `global_id` della stanza (mai tramite l'`id` locale, che su ogni istanza indica una stanza diversa). Un peer che non conosce quel `global_id` scarta il messaggio invece di indovinare. Le stanze private non vengono mai federate: la membership non è ancora federata, quindi nessun peer potrebbe far rispettare chi ha diritto di leggerle.
- **Trasporto e autenticazione**: Le istanze federate si scambiano messaggi tramite `POST /api/chat/federated/inbound`, autenticato con un header `X-Chat-Signature` sulla codifica JSON di `[username, instance, text, ts, lobby, toUsername, roomGlobalId, roomName]`. I campi sono codificati in JSON invece che uniti da un separatore, così un carattere separatore dentro il campo `text` (controllato dall'attaccante) non può produrre lo stesso input di firma di un messaggio diverso. Il mittente firma con la chiave del proprio attore di sito — RSA-SHA256 con `site_private_key`, la stessa coppia che pubblica il suo attore ActivityPub. Il ricevente risolve la chiave pubblica dell'istanza dichiarata tramite NodeInfo `metadata.actorId` → `publicKey.publicKeyPem` dell'attore, e la mette in cache in `remote_actors`. L'endpoint fallisce in modo chiuso con `503` quando non è configurata una `site_public_key` locale, e restituisce `401` su firma non valida.
- **Le firme sono solo asimmetriche**: la verifica usa la chiave pubblicata dal peer dichiarato e nient'altro. Non esiste più un fallback su segreto condiviso — un messaggio che non si può legare a un singolo host viene rifiutato, non accettato a metà. Una conseguenza operativa: se la chiave di un peer non è recuperabile (NodeInfo o endpoint attore momentaneamente irraggiungibili) il suo primo messaggio viene rifiutato con `401`; una volta recuperata la chiave resta in cache e la cosa non si ripete.
- **La risoluzione della chiave preferisce l'origin del peer**: quando il NodeInfo di un peer dichiara un `actorId` su un host diverso — di solito una `publicUrl` configurata male — lo stesso path viene provato prima sull'origin del peer, e solo dopo l'URI dichiarato. Così la chiave con cui si verifica un'istanza arriva da quell'istanza, e un peer mal configurato non sembra privo di chiave.
- **Finestra di freschezza**: una firma da sola non scade mai, quindi `ts` deve stare entro 5 minuti nel passato e 1 minuto nel futuro (tolleranza di clock skew), altrimenti il messaggio viene rifiutato con `401`. Senza questo controllo un messaggio catturato resterebbe riproducibile per sempre, una volta uscito dalla finestra di deduplica.
- **Controllo peer conosciuto**: l'`instance` dichiarata deve corrispondere a un peer già presente nella discovery federata, altrimenti `403`. La lista peer viene aggiornata da `federatedDiscoveryService` a ogni richiesta in entrata, così anche un'istanza che non ha mai inviato nulla sa con chi federa — ma un'istanza che non ha ancora scoperto il mittente lo rifiuterà. Nota che questo controllo gira *dopo* quello della firma, quindi un'istanza fuori dalla lista peer si ferma a `401` (non c'è un origin da cui risolvere una chiave) invece di arrivare al `403`.
- **Modello di fiducia — leggere prima di mettere in produzione**: una firma lega sempre il messaggio a un singolo host. Ogni istanza genera al boot la propria coppia di chiavi di sito e la pubblica sul proprio attore, quindi non resta alcun caso «senza chiave» da gestire. `TUNECAMP_CHAT_FEDERATION_SECRET` non esiste più: dalla 5.2.0 non autenticava più nulla in ricezione, e il codice che ancora la leggeva è stato rimosso. Impostarla oggi non ha alcun effetto.
- **La chat cross-instance richiede peer dalla 5.2.0 in su**: un'istanza su una release precedente accetta ancora firme con segreto condiviso, e una precedente alla 5.1.0 firma con il segreto pur pubblicando già una chiave attore di sito, quindi i suoi messaggi vengono rifiutati da un ricevente aggiornato. Aggiorna entrambi i lati prima di contare sulla chat cross-instance. Un peer la cui `publicUrl` punta a un host che non serve il suo attore prima veniva mascherato dal percorso a segreto condiviso; ora è visibile come `401`, e il suo operatore dovrebbe correggere `publicUrl`.
- **Deduplica**: I messaggi in entrata vengono deduplicati tramite hash dei campi firmati, tenuto in memoria per 6 minuti (finestra di freschezza più la tolleranza di skew, così una voce non può scadere mentre il messaggio è ancora abbastanza fresco da rientrare). L'`id` inviato nel body viene ignorato e ricalcolato localmente: non è coperto dal MAC, quindi accettarlo permetterebbe a un peer di scegliere la chiave di deduplica e pre-inserirla per sopprimere un messaggio successivo. Nessuno storage di replay persistente: la mappa si perde al riavvio.
- **Consegna e retry**: il fan-out in uscita prova ogni peer una volta, poi ritenta un errore *transitorio* — errore di rete, `5xx` o `429` — dopo 2s, 8s e 30s. Un `4xx` diverso da `429` non viene ritentato: il peer ha rifiutato il messaggio nel merito, e rimandare gli stessi byte non può cambiare la risposta. Ogni retry è inoltre limitato dalla finestra di freschezza del ricevente: il retry porta con sé il `ts` firmato originale, quindi una volta che il messaggio ha più di 5 minuti nessun ritardo potrebbe farlo accettare, e viene abbandonato con un warning nei log. È anche il motivo per cui per la chat **non esiste una coda persistente**, a differenza della consegna ActivityPub (`ap_delivery_queue`): qualunque cosa sopravvivesse a un riavvio sarebbe già troppo vecchia per essere consegnata. Un peer giù per più di ~40 secondi perde il messaggio, per scelta.
- **Il testo cifrato dei DM resta E2EE end-to-end**: la federazione inoltra solo il payload DM già cifrato tra i server — il testo in chiaro non tocca mai nessuna istanza.

### Cosa conserva il server

Per un protocollo instradato dai server la domanda rilevante sulla privacy è cosa resta su disco, quindi, esplicitamente:

- **I messaggi diretti non vengono mai persistiti** — né in locale, né alla ricezione da un peer. `relayChat` scrive su `peer_chat_messages` solo se il messaggio è un broadcast di lobby, e `relayFederatedMessage` solo per traffico di lobby o di stanza. Un DM esiste come testo cifrato in transito e nel client del destinatario, da nessun'altra parte. Non esiste una tabella che registri chi ha scritto a chi, e nessun metadato dei DM finisce nei log.
- **Lo storico della lobby** sta in `peer_chat_messages`, tagliato alle 500 righe più recenti a ogni inserimento. Il traffico di lobby è pubblico per definizione.
- **I messaggi di stanza** stanno in `chat_room_messages`, indirizzati tra istanze tramite `chat_rooms.global_id`. Le stanze private non vengono mai federate.
- **In transito** un peer vede necessariamente la busta di instradamento — `username`, `instance`, `toUsername`, `ts` — perché è ciò che gli dice dove consegnare. Non viene conservata. Toglierla significherebbe cambiare il modello di instradamento, non quello di storage.

Questo è il limite onesto del design: il *contenuto* dei messaggi è cifrato end-to-end e non finisce nei log, mentre i *metadati di instradamento* sono visibili ai due server sul percorso per il tempo necessario a instradare.

### Perché federato e non peer-to-peer

Il protocollo di chat è server-to-server, come Matrix o l'email — non peer-to-peer come Soulseek o eMule. I client tengono una WebSocket verso la propria istanza; le istanze fanno POST tra loro. È una scelta deliberata, ed è chiusa:

- **La consegna offline** richiede store-and-forward, che reintroduce un server. Un design P2P avrebbe bisogno di relay che trattengono i messaggi, e a quel punto il relay è il server.
- **I client browser e mobile** non possono mantenere connessioni peer di lunga durata — NAT, limiti di esecuzione in background, batteria. WebRTC richiederebbe signaling più TURN, e TURN inoltra comunque il traffico.
- **La riservatezza del contenuto è già garantita** dalla cifratura end-to-end, quindi il P2P comprerebbe solo privacy sui metadati.
- **La moderazione** dipende dalla possibilità per l'operatore di un'istanza di bloccare un peer. Una mesh P2P elimina del tutto questa leva.

Nota che nemmeno «spostare la chat su un grafo P2P» è un'opzione: il vecchio grafo P2P ZEN è stato rimosso e non va reintrodotto (vedi le note ZEN nel `CLAUDE.md` del repo).

### Limiti noti

Tutto quanto sopra descrive ciò che il design fa. Questo è ciò che non fa, raccolto in un unico posto perché nessuno debba dedurlo da un'assenza:

- **Nessuna forward secrecy.** Un DM è cifrato con un segreto derivato dalle due identità di lungo termine, e non c'è ratchet: lo stesso segreto protegge il primo messaggio e il millesimo. Chi ottiene una chiave privata può leggere ogni DM da o verso quell'identità che qualcuno abbia archiviato, messaggi passati compresi. È il limite più pesante di questo elenco, ed è quello che un utente ha meno probabilità di immaginare.
- **Una chiave privata vale quanto la password che c'è dietro.** L'identità è derivata dalla password dell'utente, o sigillata sotto di essa, e il vault sigillato sta sul server. Chi possiede il vault — l'istanza lo possiede — può attaccarlo offline, senza rate limit e senza account da bloccare. PBKDF2 a 600 000 iterazioni alza il costo per tentativo; non salva una password debole.
- **Stanze e lobby sono in chiaro.** Non è una svista: vedi [Stanze](#stanze-rooms) per perché moderazione e storico per chi entra dopo lo richiedono. Non mettere in una stanza nulla che richieda il modello di minaccia dei DM.
- **I metadati di instradamento sono visibili ai server sul percorso.** Chi ha scritto a chi, e quando, è esattamente ciò che dice a un'istanza dove consegnare. Non viene conservato, ma viene visto. Vedi [Cosa conserva il server](#cosa-conserva-il-server).
- **Il pinning delle chiavi è trust-on-first-use.** La prima chiave vista per un peer viene fissata e una sostituzione successiva è rifiutata, il che intercetta un server che cambia risposta. Non intercetta un server che ha mentito la *prima* volta, prima che l'utente avesse una chiave autentica con cui confrontare. I fingerprint vanno verificati fuori banda.
- **Il client te lo serve l'istanza con cui parli.** La webapp è un bundle che l'istanza ti consegna, quindi chi controlla l'istanza controlla il codice che maneggia le chiavi. La cifratura end-to-end limita ciò che un server *passivo* impara; non vincola un server che decide di servire JavaScript diverso. Un client daemon come Sidecamp, installato una volta dalla sua release, restringe il problema — non lo elimina.
- **I messaggi federati non hanno consegna offline.** Un peer irraggiungibile per più di ~40 secondi perde il messaggio; non esiste una coda durabile, per il motivo spiegato in [Chat Federata](#chat-federata-cross-instance).

---

## 3. Comandi Stile IRC e Moderazione

La chat di TuneCamp supporta i comandi slash nativi per l'interazione e la moderazione:

| Comando | Permesso | Descrizione |
| :--- | :--- | :--- |
| `/help` | Tutti | Elenca tutti i comandi disponibili nella chat. |
| `/clear` | Tutti | Pulisce la cronologia locale della finestra di chat. |
| `/kick <utente>` | Admin / Owner | Disconnette l'utente specificato dalla sessione di chat. |
| `/ban <utente>` | Admin / Owner | Banna un utente dalla lobby (persistito nel DB). |
| `/unban <utente>` | Admin / Owner | Rimuove il ban di un utente. |
| `/mute <utente>` | Admin / Owner | Silenzia un utente, impedendogli di inviare messaggi nella lobby. |
| `/unmute <utente>` | Admin / Owner | Rimuove il silenzio a un utente. |

---

## 4. Amministrazione e Configurazione

Gli amministratori dell'istanza possono controllare il comportamento della chat dal pannello Admin o tramite configurazione:

- **`peerChatEnabled`** (`boolean`): Interruttore generale per abilitare o disabilitare il servizio chat nell'istanza.
- **`peerChatGuestEnabled`** (`boolean`): Consente agli ospiti non autenticati di partecipare alla lobby pubblica con nickname temporanei.
- **`TUNECAMP_CHAT_FEDERATION_SECRET`** (variabile d'ambiente): **Rimossa.** Firma e verifica usano entrambe la chiave RSA di sito dell'istanza. La variabile non viene più letta: puoi eliminarla dal tuo ambiente. Il relay federato è disabilitato (`/inbound` risponde `503`) quando non c'è una `site_public_key` locale, e il fan-out in uscita viene saltato con un errore a log quando manca `site_private_key` — vedi [Chat Federata](#chat-federata-cross-instance).

---

## 5. Riferimento API

### Endpoint REST
- **`GET /api/chat/history`**: Recupera la cronologia recente della lobby.
- **`GET /api/chat/peers`**: Restituisce l'elenco degli utenti attualmente attivi nella chat.
- **`GET /api/chat/pubkey/:username?instance=`**: Restituisce `{ pubkey, source }` per la chiave pubblica Zen SEA di un utente. Preferisce l'identità memorizzata sull'account (`source: "identity"`, risponde anche a utente offline), ripiega sulla chiave annunciata da una sessione attiva (`source: "session"`), poi risolve il peer remoto e inoltra la richiesta. `404` se l'utente non ha né l'una né l'altra.

### Endpoint delle Stanze
Tutti richiedono una sessione (`/api/chat` è montato dietro `authMiddleware.requireUser`) e agiscono come l'utente autenticato.

- **`GET /api/chat/rooms`**: Elenca le stanze, ognuna con `id` e `globalId`.
- **`POST /api/chat/rooms`**: Crea una stanza (`name`, `description`, `is_private`); restituisce `{ id, globalId, name }`.
- **`DELETE /api/chat/rooms/:id`**: Cancella una stanza. Solo il creatore.
- **`POST /api/chat/rooms/:id/join`** / **`/leave`**: Aggiunge o rimuove l'iscrizione del chiamante.
- **`GET /api/chat/rooms/:id/messages?limit=`**: Cronologia della stanza (massimo 500).
- **`GET /api/chat/rooms/:id/members`**: Elenco dei membri della stanza.

### Endpoint di Federazione
- **`POST /api/chat/federated/inbound`**: Accetta un relay di messaggio firmato da un peer federato (vedi [Chat Federata](#chat-federata-cross-instance) sopra). I peer conosciuti si ottengono da `GET /api/community/peers`. Risposte: `202` accettato, `409` duplicato, `400` campi mancanti, `401` firma mancante/non valida oppure `ts` scaduto o troppo nel futuro, `403` istanza peer sconosciuta, `415` body non JSON, `503` federazione non configurata (nessuna chiave attore di sito). Un'istanza fuori dalla lista peer viene rifiutata con `401`, dato che non si può risolvere alcuna chiave per essa.

### Eventi WebSocket `/ws/chat`
- **`chat:message`**: Payload dei messaggi della lobby o dei DM in entrata/uscita.
- **`chat:peers`**: Aggiornamenti dell'elenco peer all'ingresso/uscita degli utenti.
- **`chat:ban` / `chat:mute`**: Segnali di moderazione inviati dagli amministratori.
- **`room_join` / `room_leave` / `room_chat`**: Iscrizione alle stanze e messaggi di stanza, indirizzati dal `roomId` locale. Un `room_chat` arrivato da un peer federato porta anche `roomGlobalId`.

---

## 6. Integrazione Client (`@tunecamp/chat`)

Esempio di integrazione in un'applicazione React:

```tsx
import { useTuneCampChat } from '@tunecamp/chat';

function ChatComponent() {
  const { messages, peers, sendMessage, formatUser } = useTuneCampChat({
    serverUrl: 'https://sudorecords.scobrudot.dev',
    token: 'USER_JWT_TOKEN'
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{formatUser(msg.from, msg.instance)}</strong>: {msg.text}
        </div>
      ))}
      <button onClick={() => sendMessage('', 'Ciao Lobby!')}>Invia</button>
    </div>
  );
}
```
