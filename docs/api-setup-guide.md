# Guida alla Configurazione dei Servizi Esterni (API)

Questa guida spiega passo-passo come ottenere e configurare le chiavi API necessarie per far funzionare tutte le integrazioni di TuneCamp.

---

## 1. Pagamenti e Monetizzazione

### Stripe (Fiat & Onramp)
1. Vai sulla [Dashboard di Stripe](https://dashboard.stripe.com/).
2. **Secret Key**: Vai in *Developers > API Keys* e copia la `Secret key` (`sk_test_...` o `sk_live_...`).
3. **Webhook Secret**:
   - Vai in *Developers > Webhooks*.
   - Aggiungi un endpoint: `https://tuo-dominio.com/api/payments/stripe/webhook`.
   - Seleziona l'evento: `checkout.session.completed`.
   - **Importante (istanze multi-artista)**: Abilita l'opzione **"Listen to events on connected accounts"** sull'endpoint. Senza questa spunta, i pagamenti effettuati su account Stripe Connect degli artisti non attiveranno il webhook e nessun codice di sblocco verrà generato.
   - Copia il "Signing secret" (`whsec_...`).
4. **Crypto Onramp**: Richiedi l'accesso a "Crypto Onramp" nelle impostazioni di Stripe e copia la relativa chiave.

### Stripe Connect (onboarding artisti — solo istanze multi-artista)

Stripe Connect permette di instradare i pagamenti fiat direttamente sul conto Stripe di ogni artista, con la commissione dell'istanza trattenuta automaticamente come `application_fee`. **Non è necessario per istanze single-artist.**

1. Assicurati di avere un account Stripe con le funzionalità **Connect** abilitate (*Settings > Connect settings* nella dashboard).
2. Dal pannello Admin di TuneCamp → artista → usa i seguenti endpoint (gestiti via Admin UI):
   - `POST /api/admin/artists/:id/stripe-connect/onboard` — crea o riusa un account Express Stripe per l'artista e restituisce il link di onboarding KYC da inviare all'artista.
   - `GET /api/admin/artists/:id/stripe-connect/status` — verifica `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`.
   - `DELETE /api/admin/artists/:id/stripe-connect` — scollega l'account (non lo elimina su Stripe).
3. L'artista completa il KYC direttamente sulla pagina ospitata da Stripe.
4. Fino a quando `chargesEnabled = false`, i checkout dell'artista usano il fallback sull'account dell'istanza.
5. **Nessuna nuova variabile d'ambiente richiesta**: l'onboarding riusa `STRIPE_SECRET_KEY` già configurata.

### MoonPay (Onramp alternativo)
1. Registrati su [MoonPay Dashboard](https://dashboard.moonpay.com/).
2. Crea una nuova API Key per l'integrazione Onramp su rete **Base**.

---

## 2. Intelligenza Artificiale

### OpenRouter (Metadati & Raccomandazioni)
1. Vai su [OpenRouter.ai](https://openrouter.ai/).
2. Crea un account e vai nella sezione *Keys*.
3. Crea una nuova chiave API.
4. (Opzionale) Se vuoi usare modelli gratuiti, assicurati di configurare `openrouter_model` su `openrouter/free` (comportamento di default).

---

## 3. Cloud Storage

### Google Drive (Streaming & Import)
1. Vai sulla [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuovo progetto.
3. Abilita la **Google Drive API**.
4. Vai in *APIs & Services > Credentials*.
5. Crea un **OAuth 2.0 Client ID** (tipo "Web application").
6. Aggiungi gli URI di redirect autorizzati: `https://tuo-dominio.com/api/storage/gdrive/callback`.
7. Copia il `Client ID` e il `Client Secret`.

---

## 4. Messaggistica e Social

### Telegram Bot (Ingestione Rapida)
1. Cerca [@BotFather](https://t.me/BotFather) su Telegram.
2. Invia il comando `/newbot` e segui le istruzioni.
3. Copia l'**API Token** fornito alla fine.
4. Per sicurezza, usa il tuo ID utente come `TUNECAMP_TELEGRAM_MASTER_ID`. Puoi scoprirlo usando [@userinfobot](https://t.me/userinfobot).

---

## 5. Peer-to-Peer (P2P)

### Soulseek (Ricerca & Download)
1. Non serve un'API Key, ma un account Soulseek standard.
2. Scarica il client Soulseek originale o registrati tramite un client compatibile.
3. Usa il tuo `Username` e `Password` nelle impostazioni di TuneCamp.

---

## 6. Configurazione nel Server

Tutte queste chiavi possono essere configurate in due modi:

### Metodo A: File `.env` (Raccomandato per lo sviluppo)
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

### Metodo B: Dashboard Admin (Raccomandato per la produzione)
Molte di queste chiavi possono essere inserite direttamente nell'interfaccia Admin di TuneCamp nella sezione **Settings**. I valori inseriti qui hanno la precedenza sul file `.env` e vengono salvati nel database SQLite.

---

## 7. Model Context Protocol (MCP)

Se desideri connettere un chatbot AI esterno (es. Claude Desktop) a TuneCamp, puoi usare il server MCP integrato. I client si autenticano tramite i token personali utente (Bearer `tc_...`) generabili dal proprio Profilo nel pannello webapp.
Per la guida alla configurazione e l'uso dello script di bridge, vedi [mcp-setup-guide.md](./mcp-setup-guide.md).

---

## Verifica
Dopo aver inserito le chiavi, riavvia il server TuneCamp. Controlla i log di avvio per assicurarti che i servizi (Telegram, GDrive) siano inizializzati correttamente senza errori di autenticazione.
