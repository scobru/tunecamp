# Internazionalizzazione (i18n) di TuneCamp — Piano Agile

**Obiettivo:** Rilasciare TuneCamp con supporto completo dell'interfaccia utente per almeno **due lingue — Inglese (`en`) e Italiano (`it`)** — con un'architettura che consenta di aggiungere ulteriori localizzazioni in seguito senza modificare il codice dei componenti.

**Stato:** Proposto  
**Proprietario:** _TBD_  
**Target:** 3 sprint (~6 settimane, 1 dev part-time)

---

## 1. Contestualizzazione & Stato Attuale

- La webapp è basata su **React 18 + Vite + TypeScript**, con store Zustand, TanStack Query e React Router (`webapp/src`, ~113 file `.tsx`, 42 pagine, 69 componenti).
- **Attualmente non è installato alcun framework i18n.** Tutti i testi dell'interfaccia sono hardcoded in linea nel JSX.
- I testi rappresentano una **miscela di inglese e italiano** (ad esempio la configurazione guidata admin era in italiano; ora tradotta in inglese). Questa incoerenza è esattamente ciò che il piano risolve a livello strutturale.
- Le documentazioni offrono già una versione speculare in italiano in `docs/it/`, dimostrando che l'intento bilingue è presente — lo estendiamo ora all'interfaccia utente del prodotto.

**Principio di progettazione:** L'inglese è la **lingua sorgente/predefinita** (fallback). L'italiano è il primo target tradotto. Ogni stringa risiede in un file risorsa associato a una chiave identificativa stabile, mai inline.

---

## 2. Stack Consigliato

| Ambito | Scelta | Motivazione |
|---|---|---|
| Framework | **`react-i18next` + `i18next`** | Standard di fatto per React, basato su hook (`useTranslation`), integrato con Vite, supporta interpolazione/plurali/namespace, caricamento pigro. |
| Rilevamento lingua | `i18next-browser-languagedetector` | Legge `localStorage` $\rightarrow$ lingua browser `navigator.language`, con catena di fallback appropriata. |
| Formattazione (date/numeri/valute) | `Intl` (integrato) via formattatori `Intl` i18next | Nessuna dipendenza aggiuntiva; la valuta è fondamentale per lo Store. |
| Archiviazione preferenza utente | Chiave `localStorage` `tc_lang` **+** salvataggio per-utente via API impostazioni (opzionale, Sprint 3) | Gli utenti anonimi ottengono una preferenza locale; gli utenti autenticati la salvano sul profilo. |

---

## 3. Struttura dei File Risorsa

```
webapp/src/i18n/
  index.ts                 # Configurazione e inizializzazione i18next
  locales/
    en/
      common.json          # pulsanti, etichette generiche, navigazione
      admin.json           # pannelli admin + configurazione guidata
      auth.json            # login / registrazione / password
      player.json          # player, in riproduzione, coda
      store.json           # negozio, checkout, pagamenti
      errors.json          # errori + messaggi di toast
    it/
      common.json
      admin.json
      ...
```

---

## 4. Articolazione degli Sprint

### Sprint 1 — Fondamenta + Primo Slice Verticale
- [ ] **A1** Aggiungere le dipendenze (`i18next`, `react-i18next`, `i18next-browser-languagedetector`); creare `src/i18n/index.ts`; avvolgere il provider `<App>` in `main.tsx`.
- [ ] **A2** Definire la lista dei namespace + struttura vuota `en`/`it`; tipi TS per le chiavi.
- [ ] **B1** Estrarre **`common.json`** (navigazione, pulsanti: Salva/Annulla/Avanti/Indietro, etichette generiche).
- [ ] **B2** Estrarre **`admin.json`** a partire dalla **Configurazione Guidata** + `auth.json`.
- [ ] **C0** Fornire valori `it` per tutte le chiavi estratte in questo sprint.
- [ ] **D1** Selettore lingua essenziale (EN/IT) nell'header, collegato a `i18n.changeLanguage` + `localStorage`.

### Sprint 2 — Estrazione Estesa
- [ ] **B3** `player.json` — player, coda, in riproduzione.
- [ ] **B4** `store.json` — negozio, pagine pubblicazioni/album, checkout, stati di pagamento.
- [ ] **B5** `errors.json` — toast, validazione form, errori API.
- [ ] **B6** Copertura delle pagine/componenti rimanenti (social, playlist, profili, pannelli admin).
- [ ] **C1** Catalogo italiano per tutte le chiavi dello Sprint 2 + revisione linguistica.
- [ ] **D2** Date/ore relative tramite formattatori `Intl`.

### Sprint 3 — Indurimento, Persistenza & Guardrail
- [ ] **D3** Salvare la lingua per utente autenticato via API impostazioni; sincronizzare `<html lang>`.
- [ ] **E1** Regola ESLint per bloccare nuove stringhe hardcoded nel JSX.
- [ ] **E2** Controllo CI / script che segnala chiavi mancanti nelle traduzioni.
- [ ] **E3** Dev toggle per pseudo-localizzazione.
- [ ] **E4** Documentazione per contributori: `docs/i18n.md` e nota in `docs/development-guide.md`.
