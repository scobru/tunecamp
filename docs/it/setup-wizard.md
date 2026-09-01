# Wizard di Configurazione Istanza

Il wizard decide *cosa è* un'istanza: quali moduli espone, se gli sconosciuti possono registrarsi e come il sito si presenta. Si trova in **Admin → Setup** ed è visibile solo all'Instance Owner (root admin).

::: tip Sono due wizard diversi
Questa pagina parla del wizard **dell'istanza**, nel pannello di amministrazione. Quello che compare al primo accesso e obbliga a cambiare password è un'altra cosa — vedi [Primo accesso: Setup Wizard](./ROLES.md#first-login-setup-wizard).
:::

Non è un flusso riservato al primo avvio. Puoi rilanciarlo quando vuoi, e farlo **sovrascrive** i flag dei moduli con quelli del profilo che scegli. Ciò che imposti a mano in Admin Settings resta valido fino al rilancio successivo.

## I quattro passi

1. **Profilo** — scegli uno dei sei preset qui sotto. Ognuno è un blocco di flag più una modalità del sito.
2. **Moduli** — i flag del preset, mostrati come interruttori. Modificali prima di proseguire: il preset è un punto di partenza, non una gabbia.
3. **Identità** — nome e descrizione del sito, precompilati con un modello del profilo scelto.
4. **Fine** — un breve elenco di prossimi passi suggeriti per quel profilo.

Il passo 3 scrive tutti i flag in un'unica `POST` all'endpoint delle impostazioni, insieme a `instanceProfile`, `siteName`, `siteDescription` e `mode`, poi aggiorna le impostazioni in cache del frontend.

## Profili

`mode` determina la forma della homepage (`single_artist`, `label`, `community`). I flag `hide*` rimuovono sezioni dalla navigazione e negano le relative rotte API a chi non è amministratore.

| Profilo | Modalità | Store | Social | Network | Live | Samples | Collab | Registrazioni aperte | Autopubblicazione ascoltatori |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Solo Artist** | `single_artist` | ✅ | ✅ | — | — | — | — | — | — |
| **Record Label** | `label` | ✅ | ✅ | ✅ | — | — | — | ✅ | — |
| **Music Curator** | `community` | — | ✅ | ✅ | — | — | — | ✅ | ✅ |
| **Web Radio / Streamer** | `community` | — | ✅ | — | ✅ | — | — | ✅ | — |
| **Sound Designer** | `community` | — | ✅ | — | — | ✅ | ✅ | ✅ | ✅ |
| **Listening Room** | `community` | — | ✅ | ✅ | — | — | — | ✅ | — |

✅ = il modulo è attivo per quel profilo. Il trattino indica che il relativo flag `hide*` è impostato.

- **Solo Artist** — portfolio: le tue release, vendite dirette, presenza Fediverso. Le superfici comunitarie sono disattivate.
- **Record Label** — catalogo di etichetta: profili artisti, catalogo, store centrale, scoperta del network attiva.
- **Music Curator** — playlist e scoperta: feed social attivo, gli ascoltatori possono autopubblicarsi.
- **Web Radio / Streamer** — trasmissione dal vivo: modulo Live attivo, store spento.
- **Sound Designer** — campioni audio gratuiti: Sample e Collab attivi, gli ascoltatori possono autopubblicarsi.
- **Listening Room** — ascolto condiviso: libreria condivisa, condivisione cartelle Sidecamp e feed social., tutto il resto rimosso.

## Cambiare idea

Ogni flag scritto dal wizard è anche un interruttore in **Admin → Settings**, quindi non serve rilanciare il wizard per cambiare una cosa sola. Rilancialo quando vuoi spostare un'istanza da una forma all'altra in blocco — da portfolio solista a etichetta, per dire — accettando che azzererà i flag di sua competenza.

`instanceProfile` viene salvato con le impostazioni, così l'istanza ricorda con quale profilo è stata configurata.
