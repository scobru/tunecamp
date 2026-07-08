# Guida alla Configurazione dei Servizi Esterni (API)

Questa guida spiega passo dopo passo come ottenere e configurare le chiavi API richieste per eseguire tutte le integrazioni di TuneCamp.

---

## 1. Pagamenti e Monetizzazione

### Stripe (Fiat)
1. Vai sulla [Dashboard di Stripe](https://dashboard.stripe.com/).
2. **Secret Key**: Vai su *Sviluppatori > Chiavi API* e copia la `Chiave segreta` (`sk_test_...` o `sk_live_...`).
3. **Webhook Secret**:
   - Vai su *Sviluppatori > Webhook*.
   - Aggiungi un endpoint: `https://tuo-dominio.com/api/payments/stripe/webhook`.
   - Seleziona l'evento: `checkout.session.completed`.
   - **Importante (istanze multi-artista)**: Abilita l'opzione **"Ascolta gli eventi sugli account connessi"** sull'endpoint. Senza questa spunta, i pagamenti effettuati sugli account Stripe Connect degli artisti non attiveranno il webhook e non verrà generato alcun codice di sblocco.
   - Copia la "Chiave segreta per la firma" (`whsec_...`).

### Stripe Connect (onboarding artisti — solo istanze multi-artista)

Stripe Connect ti consente di instradare i pagamenti in valuta fiat direttamente sul conto Stripe di ciascun artista, trattenendo automaticamente la commissione dell'istanza come `application_fee`. **Non è richiesto per le istanze a singolo artista.**

1. Assicurati di disporre di un account Stripe con le funzionalità **Connect** abilitate (*Impostazioni > Impostazioni Connect* nella dashboard).
2. Dal pannello di amministrazione di TuneCamp → artista → utilizza i seguenti endpoint (gestiti tramite l'interfaccia utente di amministrazione):
   - `POST /api/admin/artists/:id/stripe-connect/onboard` — crea o riutilizza un account Stripe Express per l'artista e restituisce il link per l'onboarding KYC da inviare all'artista.
   - `GET /api/admin/artists/:id/stripe-connect/status` — verifica lo stato con `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`.
   - `DELETE /api/admin/artists/:id/stripe-connect` — disconnette l'account (non lo elimina da Stripe).
3. L'artista completa le procedure KYC direttamente sulla pagina ospitata da Stripe.
4. Finché `chargesEnabled = false`, i pagamenti dell'artista fanno fallback sull'account dell'istanza principale.
5. **Nessuna nuova variabile d'ambiente richiesta**: l'onboarding riutilizza la `STRIPE_SECRET_KEY` già configurata.

---

## 2. Intelligenza Artificiale

### OpenRouter (Metadati e Raccomandazioni)
1. Vai su [OpenRouter.ai](https://openrouter.ai/).
2. Crea un account e accedi alla sezione *Keys*.
3. Crea una nuova chiave API.
4. (Opzionale) Se desideri utilizzare modelli gratuiti, assicurati di impostare `openrouter_model` su `openrouter/free` (comportamento predefinito).

---

## 3. Archiviazione Cloud

### Google Drive (Streaming e Importazione)
1. Vai sulla [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuovo progetto.
3. Abilita la **Google Drive API**.
4. Vai su *API e servizi > Credenziali*.
5. Crea un **ID client OAuth 2.0** (tipo "Applicazione Web").
6. Aggiungi gli URI di reindirizzamento autorizzati: `https://tuo-dominio.com/api/storage/gdrive/callback`.
7. Copia l'`ID client` e il `Client Secret`.

---

## 4. Messaggistica e Social

### Bot Telegram (Ingestione Rapida)
1. Cerca [@BotFather](https://t.me/BotFather) su Telegram.
2. Invia il comando `/newbot` e segui le istruzioni.
3. Copia il **Token API** fornito al termine.
4. Per motivi di sicurezza, utilizza il tuo ID utente come `TUNECAMP_TELEGRAM_MASTER_ID`. Puoi trovarlo utilizzando il bot [@userinfobot](https://t.me/userinfobot).

---

## 5. Peer-to-Peer (P2P)

L'acquisizione di contenuti P2P (Soulseek, BitTorrent, yt-dlp) è gestita dall'[app desktop Sidecamp](./sidecamp.md), un compagno standalone che funziona sulla tua macchina locale e sincronizza i download con la tua istanza TuneCamp. Consulta [Sidecamp](./sidecamp.md) per le istruzioni di configurazione.

---

## 6. Configurazione del Server

Tutte queste chiavi possono essere configurate in due modi:

### Metodo A: file `.env` (consigliato per lo sviluppo)
Crea un file `.env` nella root del progetto:
```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
OPENROUTER_API_KEY=sk-or-v1-...
TUNECAMP_GDRIVE_CLIENT_ID=...
TUNECAMP_GDRIVE_CLIENT_SECRET=...
TUNECAMP_TELEGRAM_BOT_TOKEN=...
TUNECAMP_TELEGRAM_MASTER_ID=...
SLSK_USER=...
SLSK_PASS=...
```

### Metodo B: Pannello di Amministrazione (consigliato per la produzione)
Molte di queste chiavi possono essere inserite direttamente nell'interfaccia di amministrazione di TuneCamp, sotto la sezione **Impostazioni**. I valori inseriti qui hanno la precedenza sul file `.env` e vengono memorizzati nel database SQLite.

---

## 7. Model Context Protocol (MCP)

Se desideri connettere un chatbot AI esterno (es. Claude Desktop) a TuneCamp, puoi utilizzare il server MCP integrato. I client si autenticano con token personali per utente (Bearer `tc_...`) che possono essere generati dal tuo Profilo nell'applicazione web.
Per la guida alla configurazione e su come utilizzare lo script di bridge, vedi [mcp-setup-guide.md](./mcp-setup-guide.md).

---

## Verifica

Dopo aver inserito le chiavi, riavvia il server di TuneCamp. Controlla i log di avvio per assicurarti che i servizi (Telegram, Google Drive) siano inizializzati correttamente senza errori di autenticazione.
