# Contribuire a Tunecamp

Grazie per il tuo interesse a contribuire a Tunecamp! Questa guida descrive il processo per proporre modifiche, configurare l'ambiente di sviluppo e inviare pull request.

## Codice di Condotta

Partecipando a questo progetto, accetti di rispettare le norme standard dei progetti open-source: sii rispettoso, costruttivo e collaborativo.

## Come Contribuire

### 1. Segnalare Bug o Richiedere Funzionalità

Prima di scrivere codice, verifica le issue esistenti per vedere se il problema è già stato affrontato. In caso contrario, apri una nuova issue specificando:
- Un titolo chiaro e descrittivo.
- I passaggi per riprodurre il problema (per i bug).
- Il comportamento atteso rispetto a quello effettivo.
- Log o screenshot pertinenti.

### 2. Proporre Modifiche

1. Effettua il **Fork** del repository.
2. Crea un **branch tematico** (`git checkout -b feature/la-tua-funzionalita`).
3. Apporta le modifiche (vedi [Configurazione dell'Ambiente di Sviluppo](#configurazione-dell-ambiente-di-sviluppo)).
4. **Verifica** le modifiche (vedi [Test](#test)).
5. Esegui il **Commit** con messaggi chiari e descrittivi (`git commit -m 'Aggiunge supporto per X'`).
6. Fai il **Push** sul tuo fork (`git push origin feature/la-tua-funzionalita`).
7. Apri una **Pull Request** verso il branch `main`.

---

## Configurazione dell'Ambiente di Sviluppo

Tunecamp è un monorepo composto da un backend in Node.js/TypeScript e un frontend in Vite/React.

### Prerequisiti

- **Node.js**: v18+
- **npm**: v9+
- **FFmpeg**: Richiesto per l'elaborazione audio (generazione di forme d'onda, transcodifica).

### Installazione

```bash
# Clona il repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# Installa le dipendenze della root e del backend
npm install

# Installa le dipendenze del frontend
cd webapp
npm install
cd ..
```

### Esecuzione Locale

Per una migliore esperienza di sviluppo, è necessario eseguire sia il backend che il frontend in parallelo.

#### Terminale 1: Backend
```bash
# Monitora e ricompila TypeScript + CSS
npm run dev
```

#### Terminale 2: Frontend
```bash
# Avvia il server di sviluppo Vite con Hot Module Replacement (HMR)
cd webapp
npm run dev
```

Il frontend inoltrerà le richieste API al backend (porta predefinita `1970`) tramite proxy.

---

## Struttura del Progetto

- `src/server/`: Logica del backend (ActivityPub, Ricerca Federata, API Subsonic, Database).
- `webapp/`: Applicazione frontend React.
- `docs/`: Documentazione integrativa su architettura e API.
- `contracts/`: Smart contract Web3 (Solidity).

---

## Test

Verifica sempre le tue modifiche prima di inviare una pull request.

```bash
# Esegui la suite di test del backend
npm test
```

Assicurati che non vi siano errori TypeScript:
```bash
npm run build
cd webapp
npm run build
```

---

## Linee Guida per le Pull Request

- Mantieni le PR focalizzate su un singolo problema o funzionalità.
- Assicurati che tutti i test vengano superati.
- Aggiorna la documentazione se introduci nuove funzionalità o modifichi comportamenti esistenti.
- Segui lo stile di scrittura del codice esistente (TypeScript, Prettier/ESLint).
