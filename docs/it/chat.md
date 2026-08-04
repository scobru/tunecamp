# Chat e Messaggistica in Tempo Reale

TuneCamp include un sistema integrato di chat di community in tempo reale e messaggistica diretta cifrata end-to-end (E2EE). Consente a fan, artisti e membri dell'istanza di comunicare direttamente dall'applicazione web o tramite client desktop/daemon come **Sidecamp**.

---

## 1. Architettura Principale

Il sistema di chat si basa su un trasporto WebSocket leggero e sulla persistenza locale in SQLite, integrando la cifratura end-to-end opzionale lato client per le conversazioni private 1-a-1.

- **Trasporto WebSocket**: Le connessioni avvengono tramite la rotta `/ws/chat` (separata dal trasporto di peer sharing `/ws/peer`).
- **Servizio Backend**: Gestito da `ChatService` (`src/server/modules/chat/chat.service.ts`).
- **Persistenza nel Database**:
  - `chat_messages`: Memorizza la cronologia dei messaggi della lobby pubblica.
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
- **DM Privati 1-a-1**: I messaggi privati tra due utenti vengono cifrati lato client con **Zen SEA** — identità a curva ellittica (secp256k1) la cui coppia di chiavi è derivata dalla password di login tramite PBKDF2 (`deriveKeyPairFromPassword`, `@tunecamp/chat`). I messaggi vengono cifrati con un segreto condiviso derivato via ECDH (`Zen.secret` + `Zen.encrypt`/`Zen.decrypt`).
- **Relay a Zero Fiducia**: Il server TuneCamp funge unicamente da relay opaco per le chiavi pubbliche e il testo cifrato. **Non vede mai il contenuto in chiaro dei DM**.
- **Persistenza della coppia di chiavi**: La coppia derivata viene memorizzata in `localStorage` per utente (`useAuthStore.ts`), così sopravvive ai ricaricamenti di pagina senza doverla ri-derivare dalla password.

### Chat Federata (Cross-Instance)
- **Relay della lobby**: I messaggi pubblici della lobby vengono trasmessi a ogni istanza peer federata conosciuta e iniettati nella loro lobby locale, taggati con l'istanza di origine del mittente.
- **DM cross-instance**: Inviare a `utente@istanza` risolve l'istanza target tramite `federatedDiscoveryService.resolvePeerByInstance()` e consegna il messaggio a quel singolo peer (non in broadcast).
- **Trasporto e autenticazione**: Le istanze federate si scambiano messaggi tramite `POST /api/chat/federated/inbound`, autenticato con un header `X-Chat-Signature` — HMAC-SHA256 su `username|instance|text|ts|lobby|toUsername` usando un segreto condiviso (`TUNECAMP_CHAT_FEDERATION_SECRET`). L'endpoint restituisce `503` se il segreto non è impostato (fail-closed) e `401` su firma non valida.
- **Deduplica**: I messaggi in entrata vengono deduplicati per hash del contenuto entro una finestra di 5 minuti in-process; nessuno storage di replay persistente.
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
- **`TUNECAMP_CHAT_FEDERATION_SECRET`** (variabile d'ambiente): Segreto HMAC condiviso per la federazione chat cross-instance. Se non impostato disabilita il relay federato (`/inbound` risponde `503`).

---

## 5. Riferimento API

### Endpoint REST
- **`GET /api/chat/history`**: Recupera la cronologia recente della lobby.
- **`GET /api/chat/peers`**: Restituisce l'elenco degli utenti attualmente attivi nella chat.
- **`GET /api/chat/pubkey/:username?instance=`**: Restituisce la chiave pubblica Zen SEA di un utente. Se l'utente non è locale, risolve il peer remoto e inoltra la richiesta.

### Endpoint di Federazione
- **`GET /api/chat/federated/peers`**: Elenca le istanze peer federate conosciute.
- **`POST /api/chat/federated/inbound`**: Accetta un relay di messaggio firmato da un peer federato (vedi [Chat Federata](#chat-federata-cross-instance) sopra).

### Eventi WebSocket `/ws/chat`
- **`chat:message`**: Payload dei messaggi della lobby o dei DM in entrata/uscita.
- **`chat:peers`**: Aggiornamenti dell'elenco peer all'ingresso/uscita degli utenti.
- **`chat:ban` / `chat:mute`**: Segnali di moderazione inviati dagli amministratori.

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
