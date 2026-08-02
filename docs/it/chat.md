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
- **DM Privati 1-a-1**: I messaggi privati tra due utenti vengono cifrati lato client mediante scambio chiavi **Curve25519** e cifratura simmetrica **XSalsa20-Poly1305** (tramite `tweetnacl`).
- **Relay a Zero Fiducia**: Il server TuneCamp funge unicamente da relay opaco per le chiavi pubbliche e il testo cifrato. **Non vede mai il contenuto in chiaro dei DM**.

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

---

## 5. Riferimento API

### Endpoint REST
- **`GET /api/chat/history`**: Recupera la cronologia recente della lobby.
- **`GET /api/chat/peers`**: Restituisce l'elenco degli utenti attualmente attivi nella chat.

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
