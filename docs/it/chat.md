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
  - `chat_room_messages`: Cronologia delle stanze (in chiaro: le stanze non sono ancora E2EE).
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
- **Provisioning**: alla registrazione, e al login con password per un account che non ha ancora un'identità, la webapp genera la coppia e carica il vault. Se l'account ha già un `zen_pub` ma nessun vault (identità collegata dal portale FID, metà privata mai caricata), il client *non* genera una seconda coppia: rinuncia all'E2EE invece di sdoppiare l'account in due identità.
- **Il cambio password deve ri-sigillare**: il vault resta cifrato con la vecchia password finché non viene rincartato, quindi ogni percorso di cambio password chiama `resealChatIdentity(newPassword)` (`useAuthStore.ts`). Saltarlo chiude fuori l'utente dalla propria identità e da tutti i DM indirizzati a essa. `POST /api/auth/zen/set` (ricollegamento a un'identità diversa) azzera `zen_priv` per lo stesso motivo: un vault obsoleto accoppierebbe una nuova chiave pubblica a una chiave privata che non le corrisponde.
- **Relay a Zero Fiducia**: Il server TuneCamp funge unicamente da relay opaco per le chiavi pubbliche e il testo cifrato. **Non vede mai il contenuto in chiaro dei DM**.
- **Origine della chiave dichiarata e a prova di downgrade**: `GET /api/chat/pubkey/:username` restituisce `source: "identity"` quando la chiave viene dall'account e `source: "session"` quando viene solo da un annuncio su socket attivo. Il client (`@tunecamp/chat`) ricorda quale ha ricevuto e non permette a una chiave di sessione annunciata via WebSocket di sovrascrivere una chiave d'identità già risolta.
- **Persistenza della coppia di chiavi**: La coppia aperta viene memorizzata in `localStorage` per utente (`useAuthStore.ts`), così sopravvive ai ricaricamenti di pagina senza la password, che non viene tenuta in memoria.

### Stanze (Rooms)
- **Conversazioni multi-utente con nome**, separate dall'unica lobby globale. L'iscrizione è legata allo *username*, non al socket: chi entra dalla webapp resta membro anche dal proprio daemon Sidecamp e dopo una riconnessione.
- **Gestite via REST** (`/api/chat/rooms*`, tutte dietro `authMiddleware.requireUser`) e usate via WebSocket (`room_join`, `room_leave`, `room_chat`). L'utente che agisce viene sempre preso dalla sessione autenticata, mai da un parametro di query.
- **La cancellazione è riservata al creatore**; le stanze private (`is_private`) sono visibili solo ai membri.
- **Non sono E2EE**: i messaggi delle stanze vengono salvati e inoltrati in chiaro, a differenza dei DM. Non usare le stanze per contenuti che richiedono il modello di minaccia dei DM.

### Chat Federata (Cross-Instance)
- **Relay della lobby**: I messaggi pubblici della lobby vengono trasmessi a ogni istanza peer federata conosciuta e iniettati nella loro lobby locale, taggati con l'istanza di origine del mittente.
- **DM cross-instance**: Inviare a `utente@istanza` risolve l'istanza target tramite `federatedDiscoveryService.resolvePeerByInstance()` e consegna il messaggio a quel singolo peer (non in broadcast).
- **Messaggi di stanza federati**: I messaggi di una stanza pubblica vengono diffusi a tutti i peer, indirizzati tramite il `global_id` della stanza (mai tramite l'`id` locale, che su ogni istanza indica una stanza diversa). Un peer che non conosce quel `global_id` scarta il messaggio invece di indovinare. Le stanze private non vengono mai federate: la membership non è ancora federata, quindi nessun peer potrebbe far rispettare chi ha diritto di leggerle.
- **Trasporto e autenticazione**: Le istanze federate si scambiano messaggi tramite `POST /api/chat/federated/inbound`, autenticato con un header `X-Chat-Signature` — HMAC-SHA256 sulla codifica JSON di `[username, instance, text, ts, lobby, toUsername, roomGlobalId, roomName]` usando un segreto condiviso (`TUNECAMP_CHAT_FEDERATION_SECRET`). I campi sono codificati in JSON invece che uniti da un separatore, così un carattere separatore dentro il campo `text` (controllato dall'attaccante) non può produrre lo stesso input di firma di un messaggio diverso. L'endpoint restituisce `503` se il segreto non è impostato (fail-closed) e `401` su firma non valida.
- **Finestra di freschezza**: una firma da sola non scade mai, quindi `ts` deve stare entro 5 minuti nel passato e 1 minuto nel futuro (tolleranza di clock skew), altrimenti il messaggio viene rifiutato con `401`. Senza questo controllo un messaggio catturato resterebbe riproducibile per sempre, una volta uscito dalla finestra di deduplica.
- **Controllo peer conosciuto**: l'`instance` dichiarata deve corrispondere a un peer già presente nella discovery federata, altrimenti `403`. La lista peer viene aggiornata da `federatedDiscoveryService` a ogni richiesta in entrata, così anche un'istanza che non ha mai inviato nulla sa con chi federa — ma un'istanza che non ha ancora scoperto il mittente lo rifiuterà.
- **Modello di fiducia — leggere prima di mettere in produzione**: il segreto HMAC è condiviso da tutta la federazione, quindi una firma valida dimostra che il messaggio arriva da *un* peer, non da *quale* peer. Qualsiasi peer in possesso del segreto può firmare a nome di qualsiasi utente di qualsiasi altra istanza; il controllo peer conosciuto limita questo alle istanze con cui federi già. Il segreto va trattato come confine di fiducia dell'intera federazione, non come credenziale per singolo peer, e va condiviso solo con operatori fidati. La soluzione corretta sono segreti per-peer, non ancora implementati.
- **Deduplica**: I messaggi in entrata vengono deduplicati tramite hash dei campi firmati, tenuto in memoria per 6 minuti (finestra di freschezza più la tolleranza di skew, così una voce non può scadere mentre il messaggio è ancora abbastanza fresco da rientrare). L'`id` inviato nel body viene ignorato e ricalcolato localmente: non è coperto dal MAC, quindi accettarlo permetterebbe a un peer di scegliere la chiave di deduplica e pre-inserirla per sopprimere un messaggio successivo. Nessuno storage di replay persistente: la mappa si perde al riavvio.
- **Il testo cifrato dei DM resta E2EE end-to-end**: la federazione inoltra solo il payload DM già cifrato tra i server — il testo in chiaro non tocca mai nessuna istanza.

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
- **`TUNECAMP_CHAT_FEDERATION_SECRET`** (variabile d'ambiente): Segreto HMAC condiviso per la federazione chat cross-instance. Se non impostato disabilita il relay federato (`/inbound` risponde `503`). È condiviso da tutti i peer, quindi è un confine di fiducia dell'intera federazione — vedi [Chat Federata](#chat-federata-cross-instance).

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
- **`POST /api/chat/federated/inbound`**: Accetta un relay di messaggio firmato da un peer federato (vedi [Chat Federata](#chat-federata-cross-instance) sopra). I peer conosciuti si ottengono da `GET /api/community/peers`. Risposte: `202` accettato, `409` duplicato, `400` campi mancanti, `401` firma mancante/non valida oppure `ts` scaduto o troppo nel futuro, `403` istanza peer sconosciuta, `415` body non JSON, `503` segreto di federazione non impostato.

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
