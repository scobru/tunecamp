# Pagamenti e Monetizzazione

TuneCamp supporta un sistema di pagamento ibrido che combina la valuta fiat tradizionale (tramite Stripe) e il Web3 (Base Network) per fornire un'esperienza di monetizzazione fluida per gli artisti.

## 1. Flussi di Pagamento Ibridi

### Stripe Checkout (Fiat)
- **Scopo**: Consente agli utenti di acquistare brani, album o asset dello store utilizzando carte di credito o di debito.
- **Rotta**: `POST /api/payments/stripe/create-session`
- **Meccanismo**:
  1. Il frontend richiede una sessione per un `itemId` e un `type` (traccia/album/asset).
  2. Il backend calcola il prezzo (convertendo ETH in USD se necessario tramite `price.ts`).
  3. Il backend individua l'artista associato all'articolo. Per gli asset dello store, si tratta dell'artista proprietario dell'asset (`artist_id`) se autoprodotto; gli asset creati dall'amministratore globale (senza `artist_id`) non hanno un artista associato. **Se l'artista dispone di un account Stripe connesso** (`artists.stripe_account_id`), la sessione viene creata come un **addebito diretto tramite Stripe Connect** su quell'account, trattenendo la commissione dell'istanza come `application_fee_amount`. **Altrimenti**, la sessione viene creata sull'account Stripe principale dell'istanza (fallback per istanze a singolo artista / self-host, o asset gestiti dall'amministratore — in cui il gestore trattiene già il 100%).
  4. Viene creata una sessione di Stripe Checkout e l'URL viene restituito al client.
  5. A pagamento avvenuto, Stripe invia un webhook a `/api/payments/stripe/webhook`. Per gli addebiti diretti, questo arriva come un **evento dell'account connesso** (assicurarsi di abilitare "Ascolta gli eventi sugli account connessi" sull'endpoint di Stripe).
  6. Il backend genera un **Codice di Sblocco (Unlock Code)** e lo memorizza nel database.

### Crypto Onramp — non implementato
- **Rotta**: `GET /api/payments/onramp-config` restituisce sempre `configured: false`. Non esiste un endpoint `onramp-session` né un provider onramp collegato (Stripe Onramp, MoonPay).
- Chi non possiede già cripto non può convertire fiat → USDC in-app oggi. L'unico percorso crypto è la **Verifica On-chain Web3** qui sotto (inviare ETH/USDC già posseduti).

### Verifica On-chain Web3
- **Scopo**: Sblocca i contenuti in base a transazioni dirette sulla blockchain.
- **Rotta**: `POST /api/payments/verify`
- **Metodi Supportati**:
  - **ETH Diretto**: Invio di ETH direttamente al wallet dell'artista.
  - **USDC Diretto**: Invio di USDC (ERC-20) al wallet dell'artista.
  - **Contratto di Checkout**: Chiamata ai metodi `purchaseWithETH` o `purchaseWithUSDC` sul smart contract `TuneCampCheckout`.
- **Meccanismo**: Il backend recupera la transazione e la ricevuta dal server RPC di Base, analizza i dati della transazione (utilizzando `ethers.js`) e verifica il destinatario e l'importo.
- **Nota**: Gli asset dello store non hanno ancora un endpoint di verifica on-chain — la scheda crypto è nascosta per i checkout degli asset, che sono limitati a Stripe.

## 1.5 Modalità di distribuzione della release ("Download Experience")

Ogni album/release sceglie **una sola** modalità di distribuzione nell'editor (**Studio → Release → Download Experience**). Viene salvata su `albums.download` e determina quale flusso di acquisto/download (se presente) la pagina della release espone.

| Modalità (UI) | Valore `download` | Comportamento |
| :--- | :--- | :--- |
| **Streaming Only** | `none` (o `null`) | Solo streaming in-app. Nessun pulsante di download, nessun flusso di acquisto. |
| **Free Download** | `free` | Download ZIP pubblico tramite `GET /api/releases/:slug/download?format=mp3\|wav` — senza pagamento, senza codice. |
| **Unlock Codes** | `codes` | Il download è protetto da un codice di sblocco univoco (vedi §2). I codici vengono emessi all'acquisto (Stripe/crypto) o distribuiti manualmente dall'editor. |
| **External Showcase** | `external` | **Tutti i flussi di acquisto/download su TuneCamp sono disabilitati.** La pagina della release sostituisce il pulsante di acquisto con un unico link **"Buy on Bandcamp"** che punta all'*External Buy URL* configurato. |

**Dettagli External Showcase:**
- L'URL di acquisto è memorizzato come prima voce di `albums.external_links` (`[{ label, url }]`). L'etichetta del pulsante è `Buy on {label}`, con default **"Buy on Bandcamp"** quando non è impostata nessuna etichetta.
- Selezionando questa modalità si forza `use_nft = false` e si azzera il prezzo — TuneCamp non trattiene mai una quota su una vendita fuori piattaforma.
- Lo streaming su TuneCamp continua a funzionare per l'audio eventualmente caricato sulla release; solo la *vendita* avviene fuori piattaforma. Caricare l'audio è facoltativo e serve solo se si vuole anche la riproduzione in-app (il modello di pubblicazione/streaming è invariato — TuneCamp non streamma da Bandcamp).

### Ricarica Slot Tracce (Stripe)
- **Scopo**: Consente a un ascoltatore di acquistare slot aggiuntivi per il caricamento di tracce quando raggiunge il proprio `listenerTrackCap` (o l'eventuale override `track_quota` personale).
- **Rotta**: `POST /api/payments/stripe/create-trackcap-session`
- **Meccanismo**:
  1. Richiede un utente autenticato; l'URL di ritorno deve puntare a questa istanza.
  2. Prezzo e numero di slot provengono dalle impostazioni admin `trackcapTopupPriceUsd` e `trackcapTopupTracksGranted`.
  3. Viene sempre addebitato sull'account Stripe dell'istanza (mai instradato tramite Connect — è una quota di piattaforma, non una vendita d'artista).
  4. Al completamento (`checkout.session.completed`), il webhook chiama `AuthService.addPurchasedTracks`, che aumenta sia `track_quota` sia il suo minimo `track_quota_floor`, così un successivo override amministrativo non può mai ridurre un acquisto già pagato.

## 2. Codici di Sblocco

Quando un pagamento viene verificato (tramite webhook di Stripe o verifica on-chain), il sistema genera un codice alfanumerico univoco di 10 caratteri.
- **Archiviazione**: `database.createUnlockCode(code, releaseId, trackId)`
- **Download**: Gli utenti possono scaricare la traccia tramite la richiesta `GET /api/payments/download/:trackId?code=XXXXX`.

## 3. Ripartizione dei Ricavi e Commissioni

TuneCamp implementa un meccanismo universale di ripartizione delle commissioni che si applica a **tutti i metodi di pagamento**, garantendo la sostenibilità della piattaforma a prescindere dal metodo scelto dall'utente.

- **Politica della Piattaforma**: Di default, la piattaforma trattiene una percentuale su ogni vendita (es. 15%).
- **Pagamenti Web3 (On-chain)**: La ripartizione è applicata direttamente dal smart contract `TuneCampCheckout`. I fondi vengono distribuiti istantaneamente: la quota dell'artista va al suo wallet e la quota della piattaforma all'indirizzo `adminTreasuryAddress`.
- **Pagamenti Stripe (Fiat)**: La ripartizione è gestita da **Stripe Connect**, rispecchiando il funzionamento del contratto on-chain:
  - **Istanze multi-artista** (l'artista ha un account connesso): l'addebito è effettuato come **addebito diretto** sull'account Stripe dell'artista — i fondi finiscono direttamente nel saldo dell'artista, mai in quello dell'istanza. La quota dell'istanza viene riscossa automaticamente come `application_fee_amount`, utilizzando la **stessa impostazione `adminFeePercentage` della ripartizione on-chain** in modo che fiat e crypto applichino la medesima percentuale. Nessun pagamento manuale o custodia di fondi.
  - **Istanze singolo artista / self-hosted** (nessun account connesso): l'addebito rimane sull'account Stripe dell'istanza. Chi gestisce il server *è* l'artista, quindi trattiene già il 100% (meno le commissioni di Stripe) — Connect aggiungerebbe solo burocrazia e attrito.
  - **Salvaguardia transfrontaliera**: Stripe rifiuta le commissioni di applicazione per gli addebiti diretti in alcuni paesi/valute (es. `MX`, `BR` / `mxn`, `brl`). Per gli account connessi basati in tali paesi, la commissione viene saltata per evitare che il checkout fallisca — l'artista riceve semplicemente l'importo totale.
- **Verifica Diretta**: Anche per la verifica diretta tramite txHash, il backend controlla se la corrispondente "Label Fee" è stata inviata alla tesoreria prima di generare un codice di sblocco.

## 3.1 Quanto trattiene davvero un artista (analisi onesta dei costi)

La promessa di TuneCamp è "nessun intermediario che impone tariffe di piattaforma", non "100% dei ricavi puliti". Ecco dove vanno effettivamente i soldi per una vendita da 10 €:

| Costo | Chi lo addebita | Importo tipico | Note |
|---|---|---|---|
| Commissione dell'istanza | L'istanza TuneCamp su cui pubblichi | 0–15% | La ripartizione predefinita è 85/15. **Se ospiti la tua istanza personale, questa è lo 0%** — tu sei la piattaforma. Gli artisti professionisti su istanze di terze parti trattengono la quota definita dalla ripartizione. |
| Elaborazione carta | Stripe | ~2.9% + 0,30 € | Inevitabile per qualsiasi pagamento fiat. TuneCamp non aggiunge alcuna maggiorazione. |
| Gas della rete | Base (Ethereum L2) | pochi centesimi | Solo per acquisti on-chain (ETH/USDC/NFT). Pagato dall'acquirente. |
| Hosting | Il tuo provider VPS | ~5–15 € al mese | Costo fisso, indipendente dal volume delle vendite. |

**Esempio** — Album da 10 € venduto tramite Stripe sulla tua istanza self-hosted: 10 € − 0,59 € (Stripe) ≈ **9,41 € a te (~94%)**. La stessa vendita su Bandcamp: 10% di revenue share + ~5% di elaborazione dei pagamenti ≈ **8,50 €**. La differenza si accumula con il volume delle vendite, ma è importante essere realisti riguardo ai costi fissi di hosting: al di sotto di circa 10–20 € al mese di vendite, una piattaforma gestita esternamente potrebbe farti guadagnare di più.

**Pagamenti on-chain: commissioni vicine allo zero, con alcune avvertenze.** Un acquirente che possiede già USDC su Base paga solo il gas (centesimi) e tu ricevi quasi il 100% — la situazione migliore in assoluto, superiore al ~94% di Stripe. Due avvertenze impediscono che questa sia la scelta predefinita raccomandata: (1) chi non possiede già criptovalute non ha oggi un onramp in-app (vedi §1, "Crypto Onramp — non implementato") — dovrebbe acquistare USDC/ETH altrove prima, UX peggiore di un semplice checkout con carta; (2) ricevi USDC/ETH, quindi convertire in EUR comporta costi di cambio/prelievo, e detenere ETH comporta rischi legati alle oscillazioni di prezzo (USDC evita ampiamente questo aspetto). La ripartizione delle commissioni dell'istanza (85/15 predefinita) si applica anche on-chain — è applicata dal smart contract `TuneCampCheckout` stesso.

## 3.2 Onboarding Stripe Connect (account artisti)

Per le istanze multi-artista, ogni artista collega il proprio account Stripe (Express) in modo che i pagamenti con carta possano essere instradati direttamente a lui. Questo è gestito dall'amministratore (lo stesso controllo applicato alla pubblicazione per gli artisti):

- `POST /api/admin/artists/:id/stripe-connect/onboard` — crea (o riutilizza) l'account Express dell'artista, ne memorizza l'ID in `artists.stripe_account_id` e restituisce un link di onboarding Stripe. L'artista completa la procedura KYC lato Stripe.
- `GET /api/admin/artists/:id/stripe-connect/status` — restituisce lo stato: `connected`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted` e `country`.
- `DELETE /api/admin/artists/:id/stripe-connect` — scollega l'account dall'artista (ma **non** lo elimina su Stripe); i suoi checkout tornano a utilizzare l'account Stripe dell'istanza.

Non sono necessarie nuove variabili d'ambiente — l'onboarding riutilizza la chiave `stripe_secret_key` dell'istanza. Fino a quando un artista non completa l'onboarding (`chargesEnabled = false`), i suoi checkout fiat utilizzeranno il fallback a singolo artista (account dell'istanza).

## 4. Configurazione

Variabili d'Ambiente Richieste:
- `STRIPE_SECRET_KEY`: Chiave segreta dell'API Stripe.
- `STRIPE_WEBHOOK_SECRET`: Segreto per verificare le firme dei webhook.
- `TUNECAMP_RPC_URL`: Endpoint RPC per la rete Base (es. Alchemy o RPC pubblico di Base).
- `TUNECAMP_OWNER_ADDRESS`: Indirizzo predefinito per le commissioni della piattaforma.

### Webhook Stripe — "Ascolta gli eventi sugli account connessi"

Quando almeno un artista ha un account Stripe connesso, le sessioni di checkout vengono create come **addebiti diretti** su quell'account. Stripe invia il risultante evento `checkout.session.completed` come un **evento di account connesso** (il campo `event.account` è impostato). L'endpoint del tuo webhook deve avere l'opzione **"Ascolta gli eventi sugli account connessi" (Listen to events on connected accounts)** abilitata nella Dashboard di Stripe (*Sviluppatori → Webhook → il tuo endpoint → Modifica*); altrimenti questi eventi verranno scartati silenziosamente e non verranno generati codici di sblocco per i pagamenti effettuati sugli account connessi.

La stessa chiave `STRIPE_WEBHOOK_SECRET` copre sia gli eventi della piattaforma sia quelli degli account connessi — non è necessario un secondo segreto.
