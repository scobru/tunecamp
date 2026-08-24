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

| Profilo | Modalità | Store | Social | Network | Dig | Live | Samples | Collab | Lab | Registrazioni aperte | Autopubblicazione ascoltatori |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Solo Artist** | `single_artist` | ✅ | ✅ | — | — | — | — | — | — | — | — |
| **Record Label** | `label` | ✅ | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| **Music Curator** | `community` | — | ✅ | ✅ | ✅ | — | — | — | — | ✅ | ✅ |
| **Web Radio / Streamer** | `community` | — | ✅ | — | ✅ | ✅ | — | — | — | ✅ | — |
| **Sound Designer** | `community` | — | ✅ | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Listening Room** | `community` | — | ✅ | ✅ | — | — | — | — | — | ✅ | — |

✅ = modulo attivo per quel profilo. Il trattino indica che il corrispondente flag `hide*` è impostato.

"Social" è il feed Fediverso (`/social`, flag `hideSocial`) — **non** la bacheca. La bacheca ha un'impostazione sua, `boardEnabled`, che il wizard non tocca ed è spenta finché non la attivi da Admin Settings.

- **Solo Artist** — un portfolio: le tue uscite, vendita diretta, presenza sul Fediverso. Le superfici di community sono spente.
- **Record Label** — un roster: profili artista, catalogo, store centrale, scoperta di rete attiva.
- **Music Curator** — playlist e scoperta: Dig per le fonti esterne, feed social attivo, gli ascoltatori possono autopubblicarsi.
- **Web Radio / Streamer** — trasmissione dal vivo: moduli Live e Dig attivi, store spento.
- **Sound Designer** — sample pack gratuiti: Samples, Collab e Lab attivi, autopubblicazione consentita.
- **Listening Room** — ascolto condiviso: libreria, cartelle Sidecamp e feed social, tutto il resto rimosso.

## Cambiare idea

Ogni flag scritto dal wizard è anche un interruttore in **Admin → Settings**, quindi non serve rilanciare il wizard per cambiare una cosa sola. Rilancialo quando vuoi spostare un'istanza da una forma all'altra in blocco — da portfolio solista a etichetta, per dire — accettando che azzererà i flag di sua competenza.

`instanceProfile` viene salvato con le impostazioni, così l'istanza ricorda con quale profilo è stata configurata.
