# Ruoli e Permessi in TuneCamp

Questo documento descrive i diversi ruoli all'interno di un'istanza TuneCamp, le loro capacità e i relativi vincoli di sicurezza.

TuneCamp utilizza un sistema di controllo degli accessi basato sui ruoli (RBAC) per garantire che ciascun utente possa operare solo nell'ambito del ruolo assegnato.

---

## 1. Proprietario dell'Istanza (Root Admin)
Il **Proprietario dell'Istanza** (o Root Admin) è l'amministratore principale del sistema. In genere corrisponde al primo utente creato (ID 1). Ha il livello di autorità più elevato.

### Capacità Esclusive:
- **Gestione Globale del Sito:** Modificare il nome del sito, la descrizione, l'URL pubblico, i loghi e le immagini di sfondo.
- **Configurazione Web3:** Impostare gli indirizzi dei wallet per i pagamenti in USDC/USDT e i contratti NFT.
- **Gestione Completa degli Utenti:**
  - Creare e gestire tutti i ruoli.
  - Reimpostare le password per qualsiasi utente.
  - Eliminare account (tranne il proprio).
- **Identità di Sistema:** Accesso alle chiavi crittografiche e alle attività di manutenzione a livello di server.

---

## 2. Manager (Amministratore Completo)
Il **Manager** ha ampi poteri amministrativi per supervisionare la comunità e i contenuti, senza tuttavia disporre del controllo completo del server.

### Capacità:
- **Monitoraggio Utenti:** Può visualizzare l'elenco degli utenti registrati.
- **Rete Federata:** Gestire i follower e la sincronizzazione di ActivityPub.
- **Moderazione dei Contenuti:** Gestire i post e le pubblicazioni (release) in tutta l'istanza.
- **Supporto Artisti:** Può operare per conto di qualsiasi artista a cui è assegnato.

---

## 3. Curatore (Super Utente / Gestione Libreria)
Il **Curatore** è un ruolo specializzato incentrato sulla qualità della libreria e sull'organizzazione dei contenuti.

### Capacità:
- **Visibilità Globale:** Può visualizzare tutti i contenuti (inclusi quelli privati/bozze) per assistere nella curatela.
- **Gestione della Libreria:** Può modificare metadati, copertine e organizzazione per qualsiasi traccia o album.
- **Manutenzione:** Aiutare a mantenere la struttura della libreria e correggere eventuali errori.

---

## 4. Ascoltatore (Utente Standard)
L'**Ascoltatore** è il ruolo di base per gli utenti che consumano musica e interagiscono con la piattaforma.

### Capacità:
- **Ascolto e Collezione:** Ascoltare musica in streaming tramite il lettore web o app compatibili con Subsonic, acquistare contenuti e gestire i preferiti.
- **Interazione Sociale:** Creare playlist, commentare, seguire gli artisti e gestire il proprio profilo.

---

## 5. Ascoltatore-Artista (Ascoltatore con profilo artista)
Un **Ascoltatore-Artista** è un account con ruolo utente standard (`user`) che è stato collegato a un profilo artista da un amministratore. Il ruolo rimane `user` — **non avviene alcuna promozione a Curatore** — ma il collegamento al profilo artista concede i diritti di pubblicazione tramite `canPublishContent`. Questo è lo stato in cui entra un ascoltatore dopo che la sua richiesta di diventare artista viene approvata.

### Capacità aggiuntive rispetto a un semplice Ascoltatore:
- **Caricare tracce** e creare album/pubblicazioni sotto il proprio profilo artista.
- **Post ActivityPub** (annunci di nuove release) sotto la propria identità di artista.
- **Quota di archiviazione** assegnata al momento dell'approvazione (configurabile tramite Admin → Settings → `listenerSelfPublishQuota`).

### Cosa non possono ancora fare:
- Modificare o gestire i contenuti di altri utenti (nessun accesso in scrittura all'intera libreria).
- Accedere al pannello di amministrazione globale.
- Vendere contenuti (bloccato lato server in fase di checkout) — vedi il flag `can_sell` di seguito.

### Percorsi per diventare un Ascoltatore-Artista:
1. **Iniziato dall'amministratore:** L'amministratore collega manualmente un profilo artista a un utente esistente (Admin → Users → Edit → Artist Profile).
2. **Richiesta autonoma:** L'ascoltatore ne richiede uno da **Profile → Settings → Become an Artist**. L'amministratore lo approva dal pannello Utenti (`POST /api/admin/system/users/:id/approve-artist`): viene creato un profilo artista con il suo nome utente, il flag `can_sell` viene impostato su `false` e viene applicata la quota di archiviazione. Il ruolo rimane `user`.

---

## 6. Il flag `can_sell` (gate di vendita per artista)
`can_sell` è un flag sul **profilo dell'artista** (non sull'account utente). Controlla se gli acquirenti possono completare un acquisto per i contenuti di quell'artista. È indipendente dal ruolo dell'utente.

| `can_sell` | Effetto |
| :--- | :--- |
| `0` (valore predefinito dopo l'approvazione) | Il checkout di Stripe, l'on-ramp crypto e il minting di NFT sono **rifiutati** lato server per gli articoli di questo artista. Il pulsante "Acquista" può essere nascosto sul client, ma il server applica comunque il blocco. |
| `1` | Vendite abilitate a tutti gli effetti — Stripe (addebito diretto sull'account connesso dell'artista se `stripe_account_id` è impostato, altrimenti sull'account dell'istanza), crypto e minting NFT funzionano regolarmente. |

**Come viene abilitato `can_sell`:**
- Il Manager o il Root Admin abilitano l'opzione "Vendite abilitate" nell'editor dell'artista (Admin → Library → Artists → Edit).
- **In automatico tramite Stripe Connect:** Quando un artista completa l'onboarding di Stripe Connect e `charges_enabled` diventa `true` sul suo account connesso, il webhook `account.updated` imposta automaticamente `can_sell = 1`. Se in seguito Stripe disabilita gli addebiti, il valore ritorna a `0`.

---

## Matrice dei Permessi (Riepilogo)

| Capacità | Root Admin | Manager | Curatore | Ascoltatore-Artista | Ascoltatore |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Modificare Impostazioni Sito | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gestire gli Utenti | ✅ | ✅ (visualizza) | ❌ | ❌ | ❌ |
| Modificare Contenuti di Altri | ✅ | ✅ | ✅ | ❌ | ❌ |
| Caricare Musica / Creare Release | ✅ | ✅ | ✅ (con link artista) | ✅ (solo proprio profilo) | ❌ |
| Vendere Musica / Salvare Asset | ✅ | ✅ (con `can_sell`) | ✅ (con link artista + `can_sell`) | ✅ (con `can_sell`) | ❌ |
| Post Social (ActivityPub) | ✅ | ✅ | ✅ (con link artista) | ✅ (solo proprio profilo) | ❌ |
| Accedere alle Chiavi del Server | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gestire la Federazione | ✅ | ✅ | ❌ | ❌ | ❌ |

### Nomi interni dei ruoli (per debug / query sul DB)

| Nome nella UI | Valore `role` nel DB | Enum `UserRole` |
| :--- | :--- | :--- |
| Root Admin / Instance Owner | `root_admin` | `ROOT_ADMIN` |
| Manager | `admin` | `ADMIN` |
| Curator | `super_user` | `SUPER_USER` |
| Ascoltatore-Artista | `user` + `artist_id IS NOT NULL` | `NORMAL_USER` |
| Ascoltatore | `user` | `NORMAL_USER` |
| Non autenticato | — | `GUEST` |

---

## Primo Accesso: Procedura Guidata di Configurazione

Quando un utente effettua l'accesso e la password del suo account è quella temporanea sentinella `tunecamp`, l'applicazione web ne blocca l'accesso dietro una procedura guidata (setup wizard) fino a quando la password non viene modificata. Il backend lo segnala tramite il flag `mustChangePassword` restituito da `POST /api/auth/login` (calcolato da `isDefaultPassword` in `auth.service.ts`, che verifica la presenza della sentinella `tunecamp`).

> Nota: l'amministratore di bootstrap creato al primo avvio utilizza `admin`/`admin` (o `TUNECAMP_ADMIN_USER`/`TUNECAMP_ADMIN_PASS`), **non** `tunecamp` — pertanto tale account non viene forzato a passare automaticamente attraverso la procedura guidata; modifica la sua password manualmente dopo il primo accesso. La procedura guidata viene attivata per gli account per i quali un amministratore ha ripristinato la password a `tunecamp` (vedi sotto).

Ciò che la procedura guidata mostra dipende dal ruolo:

- **Proprietario dell'Istanza (Root Admin)** — due passaggi:
  1. **Sicurezza** — sostituire la password predefinita.
  2. **Identità** — impostare il nome del sito e la descrizione dell'istanza. Questo passaggio può essere saltato e configurato in un secondo momento in Admin Settings.
- **Tutti gli altri ruoli** (Manager, Curatore, Ascoltatore) — un singolo passaggio di **Sicurezza** per sostituire la password temporanea. Il passaggio Identità non viene mostrato poiché le impostazioni del sito sono esclusive del Proprietario dell'Istanza (vedi Matrice dei Permessi sopra).

Un Root Admin può forzare qualsiasi utente a completare il passaggio della password al prossimo accesso reimpostando la password di quell'utente su `tunecamp` (`PUT /api/admin/system/users/:id/password`).

---

## Verifica della Sicurezza

TuneCamp implementa questi controlli a livello di API:
1. **Middleware JWT:** Ogni richiesta autenticata verifica il ruolo (`isAdmin`) e l'identità (`userId`).
2. **Proprietà dei Contenuti:** Le API di modifica (`PUT`, `DELETE`) verificano che `owner_id` (che fa riferimento a `admin.id`) corrisponda al `userId` del richiedente, a meno che il richiedente non sia un amministratore. Il sistema include attività di manutenzione per garantire che tutti i contenuti siano correttamente di proprietà di un amministratore valido.
3. **Protezione SSRF:** Le operazioni di rete (ActivityPub follow) sono protette da attacchi SSRF tramite la validazione degli URL.
4. **Sanitizzazione:** I nomi dei file e i metadati vengono sanitizzati per prevenire attacchi di Path Traversal e XSS.
5. **Controllo Quota:** Durante il caricamento, lo spazio su disco disponibile dell'utente viene verificato dinamicamente prima di accettare i file.
