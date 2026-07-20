# TuneCamp Lab

Il **Lab** è l'area sperimentale di TuneCamp — uno spazio in cui gli sviluppatori possono distribuire strumenti audio autonomi che vengono eseguiti incorporati in TuneCamp senza dover modificare la base di codice principale.

Ogni applicazione Lab:
- Viene eseguita all'interno di un **iFrame** isolato in sandbox (nessun rischio di sicurezza per l'applicazione principale)
- Può richiedere permessi al browser (microfono, ecc.) limitati al proprio contesto
- È definita da una riga nella tabella DB `lab_apps`
- Può opzionalmente comunicare con TuneCamp tramite il **Lab SDK** (bridge basato su PostMessage)

---

## Guida Rapida: Aggiungere un'app Lab

Le app sono salvate nella tabella SQLite `lab_apps` (`src/server/core/database.ts`), gestite tramite l'API admin (`src/server/routes/admin/lab-apps.ts`) e il pannello **Admin → Lab Apps** (`AdminLabAppsPanel.tsx`) — nessuna modifica al codice necessaria per aggiungerne o modificarne una.

- **Via UI:** Pannello Admin → Lab Apps → *Add App*, compila i campi qui sotto.
- **Via API:** `POST /api/admin/lab-apps` (solo root-admin) con gli stessi campi come corpo JSON.
- **Default integrati:** seminati al primo avvio in `database.ts` (attualmente 4-Track Recorder, id 1, e Audiofabric, id 2) — modifica quei blocchi `INSERT OR IGNORE` per cambiare i default distribuiti.

La pagina pubblica `/lab` e il runner `/lab/<id>` leggono da `GET /api/lab-apps` (solo app abilitate) e caricano automaticamente le nuove righe, senza bisogno di rebuild.

### Campi del Manifest

```typescript
interface LabApp {
  id: number;            // id riga DB, assegnato automaticamente  →  /lab/<id>
  name: string;
  description: string;
  src: string;          // URL dell'app (ospitata esternamente o percorso relativo)
  category: 'recording' | 'synthesis' | 'composition' | 'effects' | 'other';
  author: string;
  sourceUrl: string;    // Collegamento GitHub / repository mostrato nella barra degli strumenti
  permissions: string[]; // Mostrati come badge sulla scheda dell'app (informativi)
  sandbox: string[];    // Token dell'attributo sandbox dell'iFrame
  allow: string[];      // Attributo allow dell'iFrame (feature policy)
  enabled: boolean;     // nascosta da /lab e GET /api/lab-apps se false
}
```

### Esempio — Registratore a 4 tracce (4-Track Recorder)

```typescript
// Corpo POST /api/admin/lab-apps (l'id è assegnato automaticamente)

{
  name: '4-Track Recorder',
  description:
    'Registratore audio a 4 tracce basato su browser con supporto overdub, ' +
    'compensazione della latenza e riproduzione multi-traccia accurata al campione. ' +
    'Funziona interamente nel browser — nessun server richiesto.',
  src: 'https://tunecamp-4-track-recorder.vercel.app',
  category: 'recording',
  author: 'andreboekhorst',
  sourceUrl: 'https://github.com/andreboekhorst/4-track-recorder',
  permissions: ['microphone'],
  sandbox: ['allow-scripts', 'allow-same-origin', 'allow-downloads', 'allow-forms'],
  allow: ['microphone'],
}
```

### Valori comuni per `sandbox`

| Token | Quando utilizzarlo |
|---|---|
| `allow-scripts` | L'app esegue codice JavaScript (sempre richiesto) |
| `allow-same-origin` | L'app utilizza `localStorage`, `IndexedDB`, cookie |
| `allow-downloads` | L'app consente agli utenti di salvare file locali |
| `allow-forms` | L'app contiene form d'invio dati (`<form>`) |
| `allow-popups` | L'app apre nuove finestre o schede del browser |
| `allow-modals` | L'app utilizza finestre di dialogo `alert` / `confirm` |

### Valori comuni per `allow` (feature policy)

| Valore | Quando utilizzarlo |
|---|---|
| `microphone` | L'app registra audio tramite il microfono dell'utente |
| `camera` | L'app accede alla fotocamera |
| `midi` | L'app utilizza le API Web MIDI |
| `autoplay` | L'app avvia automaticamente la riproduzione audio |

---

## Opzioni di Hosting

### A — URL Esterno (consigliato per esperimenti)

Fai puntare il parametro `src` all'URL di una demo attiva. È il modo più rapido per rilasciare un'app.

```typescript
src: 'https://www.4track.cc'
```

> **Avvertenza:** alcuni siti impostano le intestazioni `X-Frame-Options: DENY` o `Content-Security-Policy: frame-ancestors 'none'`, che ne bloccano l'incorporamento. Se l'app si rifiuta di caricarsi all'interno dell'iFrame, utilizza l'opzione B.

### B — Fork ed Auto-hosting

1. Esegui un fork del repository dell'app
2. Compilala: `npm run build`
3. Ospita la cartella `dist/` su una piattaforma di hosting statico (Vercel, Netlify, GitHub Pages, o un tuo server)
4. Fai puntare il parametro `src` all'URL in cui è ospitata l'app

### C — Pacchetto incorporato in TuneCamp

Posiziona la cartella compilata `dist/` sotto il percorso `webapp/public/lab/<id>/` e imposta:

```typescript
src: '/lab/4track/index.html'
```

L'app verrà servita direttamente dal server di file statici di TuneCamp. Ottimo per istanze offline o self-hosted.

---

## Lab SDK (PostMessage Bridge)

Le app possono comunicare opzionalmente con TuneCamp utilizzando `window.postMessage`. Ciò consente a un'app Lab di leggere la libreria dell'utente, rispondere agli eventi di riproduzione o salvare file audio all'interno di TuneCamp.

Tutte e quattro le azioni sono gestite nativamente da TuneCamp — non sono necessarie modifiche all'applicazione principale quando si aggiunge una nuova app Lab.

### Protocollo

Ogni richiesta segue lo stesso schema:

```javascript
// 1. Invia la richiesta a TuneCamp
window.parent.postMessage(
  { type: 'tunecamp:request', action: '<action>', payload: { /* opzionale */ } },
  '*'
);

// 2. Ascolta la risposta
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'tunecamp:response') return;
  if (event.data?.action !== '<action>') return; // verifica il nome dell'azione
  console.log(event.data.payload);
});
```

La risposta ha sempre la struttura `{ type: 'tunecamp:response', action, payload }`.

---

### Azioni Disponibili

#### `getUser`

Restituisce l'utente attualmente connesso, o `null` se non è autenticato.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getUser' },
  '*'
);

// Payload di risposta
// { id: string, username: string, role: 'admin' | 'user' | 'super_user' | null }
// oppure null
```

---

#### `getLibrary`

Restituisce una porzione della libreria di tracce dell'utente.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getLibrary', payload: { limit: 50 } },
  '*'
);

// Payload di risposta
// {
//   tracks: [
//     {
//       id: string,
//       title: string,
//       artist: string,
//       album: string,
//       duration: number,       // secondi
//       streamUrl: string,      // URL di streaming autenticato
//       coverUrl: string,       // URL della copertina
//     },
//     ...
//   ]
// }
```

Se omesso, `limit` assume come valore predefinito 50.

---

#### `getNowPlaying`

Restituisce la traccia attualmente in riproduzione in TuneCamp, o `null` se non c'è nulla in riproduzione.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getNowPlaying' },
  '*'
);

// Payload di risposta (traccia in riproduzione)
// {
//   track: {
//     id: string,
//     title: string,
//     artist: string,
//     album: string,
//     duration: number,
//     streamUrl: string,
//     coverUrl: string,
//   },
//   isPlaying: boolean,
//   currentTime: number,   // secondi trascorsi
//   duration: number,      // durata totale in secondi
// }
// oppure null
```

---

#### `exportAudio`

Salva un `Blob` audio direttamente all'interno della libreria TuneCamp dell'utente.

```javascript
const blob = await myApp.exportMix(); // l'app genera un Blob audio

window.parent.postMessage(
  {
    type: 'tunecamp:request',
    action: 'exportAudio',
    payload: {
      blob,
      filename: 'my-recording.wav',
      mimeType: 'audio/wav',
    },
  },
  '*'
);

// Payload di risposta
// { success: true }
// oppure { success: false, error: string }
```

---

### Esempio di codice di supporto completo (helper)

Inserisci questo codice all'interno di qualsiasi app Lab per ottenere un SDK tipizzato e basato su Promise, senza dipendenze esterne:

```javascript
function tunecampSDK() {
  function request(action, payload) {
    return new Promise((resolve) => {
      function onMessage(event) {
        if (event.data?.type !== 'tunecamp:response') return;
        if (event.data?.action !== action) return;
        window.removeEventListener('message', onMessage);
        resolve(event.data.payload);
      }
      window.addEventListener('message', onMessage);
      try {
        window.parent.postMessage({ type: 'tunecamp:request', action, payload }, '*');
      } catch {
        // L'app non è all'interno di un iFrame TuneCamp
        window.removeEventListener('message', onMessage);
        resolve(null);
      }
    });
  }

  return {
    getUser:       ()        => request('getUser'),
    getNowPlaying: ()        => request('getNowPlaying'),
    getLibrary:    (limit)   => request('getLibrary', { limit: limit ?? 50 }),
    exportAudio:   (blob, filename, mimeType) =>
      request('exportAudio', { blob, filename, mimeType }),
  };
}

// Esempio d'uso
const tc = tunecampSDK();
const user    = await tc.getUser();          // { id, username, role } | null
const library = await tc.getLibrary(20);     // { tracks: [...] }
const now     = await tc.getNowPlaying();    // { track, isPlaying, ... } | null
```

---

## Esempio Pratico: Integrazione di 4-Track Recorder

### Funzionamento

[4-Track Recorder](https://github.com/andreboekhorst/4-track-recorder) è un'app SvelteKit che utilizza le API Web Audio per registrare fino a 4 tracce audio nel browser, con supporto per overdub e compensazione della latenza. Salva i progetti in un formato binario personalizzato `.4trk`.

### Stack Tecnologico

- **Frontend:** SvelteKit + TypeScript
- **Build:** Vite
- **Audio:** Web Audio API (nessun backend)
- **Archiviazione:** salvataggio locale dei file (file `.4trk`)

### Perché l'iFrame, e non un componente React

L'applicazione è sviluppata in Svelte, non in React. Incorporarla come componente React richiederebbe di riscriverla interamente. L'approccio con iFrame consente di eseguirla così com'è, all'interno del proprio contesto JavaScript, senza alcun conflitto tra framework.

### Incorporamento in TuneCamp

La voce descritta nel manifest sopra è tutto ciò che serve per l'integrazione di base. Risultato:

- La pagina `/lab` mostra una scheda con il nome dell'app, la categoria e le indicazioni sui permessi
- L'URL `/lab/4track` apre l'app a schermo intero all'interno di TuneCamp con un pulsante per tornare indietro e un collegamento al repository dei sorgenti
- L'attributo `allow="microphone"` inoltra la richiesta di autorizzazione del microfono dal browser all'iFrame

### Opzionale: integrazione profonda tramite Lab SDK

Una versione derivata di 4-Track Recorder potrebbe usare il PostMessage bridge già implementato per:

```javascript
// Al termine di una registrazione, propone il salvataggio nella libreria di TuneCamp
const blob = await exportMix(); // ottiene il mix finale come Blob
window.parent.postMessage({
  type: 'tunecamp:request',
  action: 'exportAudio',
  payload: {
    blob,
    filename: 'my-recording.wav',
    mimeType: 'audio/wav',
  },
}, '*');
```

Ciò salverebbe la traccia direttamente nella libreria TuneCamp dell'utente senza dover uscire dall'app Lab.

---

## Invio di un'app Lab

1. Deploya o forka la tua app in modo che abbia un URL `src` stabile (oppure includila sotto `webapp/public/lab/<id>/` per l'auto-hosting)
2. Chiedi a un root-admin di aggiungerla tramite il pannello **Admin → Lab Apps**, oppure apri una PR aggiungendo un blocco seed `INSERT OR IGNORE` a `src/server/core/database.ts` (vedi i blocchi esistenti di 4-Track Recorder / Audiofabric) se deve essere un default integrato
3. Se apri una PR, intitolala `feat(lab): add <Nome Tua App>`
4. Nella descrizione della PR includi:
   - Cosa fa l'app
   - Il link al repository o alla demo attiva
   - Quali permessi del browser richiede e perché
   - Uno screenshot o un breve video dimostrativo

---

## Differenze rispetto ai Plugin

| | App Lab | Plugin Backend |
|---|---|---|
| **Cosa estendono** | L'interfaccia utente frontend (strumenti audio, sintetizzatori) | I provider backend (metadati, streaming, archiviazione…) |
| **Stack tecnologico** | Qualsiasi (basate su iFrame) | Node.js / ESM |
| **Dove sono collocate** | Tabella DB `lab_apps` (via pannello Admin / API) | `plugins/<nome>.js` |
| **Come vengono caricate** | Dal frontend React a runtime, da `GET /api/lab-apps` | Dal caricatore dei plugin del server all'avvio |
| **Esempi** | 4-Track Recorder, Patchcab, ComposeYogi | Provider di metadati personalizzato, Soulseek, storage S3 |

