# TuneCamp Collab

**Collab** consente a più artisti sulla stessa istanza di creare un brano insieme: caricare stem, salvare snapshot delle versioni ed effettuare iterazioni — senza app separate, senza tempo reale e senza ZEN.

## Perché nativo e non app Lab

Collab necessita di ricchi dati relazionali (progetti, versioni, permessi) e pagine dedicate (elenco, dettaglio, cronologia versioni) — l'[SDK Lab](LAB.md) è progettato per strumenti monouso senza stato incorporati via iFrame, non per questo scopo. Collab è una funzionalità di primo livello di TuneCamp con tabelle e rotte proprie.

## Modello Dati

- **`collab_projects`** — `title`, `description`, `owner_id`, `visibility` (`shared` | `private`).
- **`collab_versions`** — append-only, mai sovrascritti (`UNIQUE(project_id, version)`). Ogni riga è uno snapshot (`state`, JSON opaco), firmato da chi lo ha salvato.
- **`collab_stems`** — livelli audio grezzi in lavorazione, deliberatamente separati da `tracks`/`samples` (senza semantica di pubblicazione/curatela).

Vedi [architecture-backend.md](architecture-backend.md#modello-dei-dati) per l'elenco completo dello schema.

## Permessi

Riusa il gate di pubblicazione esistente — nessun nuovo sistema di permessi:

- **Lettura**: richiede autenticazione; i progetti con `visibility='shared'` sono leggibili da qualsiasi utente autenticato, quelli `private` solo dal proprietario.
- **Scrittura** (creare progetti, caricare stem, salvare versioni): richiede `VisibilityGuardian.canPublishContent()` — lo stesso gate di pubblicazioni, sample pack ed ogni altro endpoint di pubblicazione.
- **Cancellazione**: solo il creatore del progetto (corrispondenza `owner_id`).
- **Collaborazione aperta v1**: qualsiasi artista sull'istanza che supera `canPublishContent` può scrivere in un progetto condiviso — senza elenchi di invitati/collaboratori.

## API

| Metodo | Rotta | Note |
| --- | --- | --- |
| `GET` | `/api/collab` | Elenca i progetti condivisi (`?mine=true` per i propri progetti). |
| `POST` | `/api/collab` | Crea un progetto. |
| `GET` | `/api/collab/:id` | Progetto + versioni + stem. |
| `DELETE` | `/api/collab/:id` | Solo il proprietario. |
| `POST` | `/api/collab/:id/versions` | Salva uno snapshot di versione (`state`, `note` opzionale). |
| `POST` | `/api/collab/:id/stems` | Carica uno stem audio (multipart `file`). |
| `GET` | `/api/collab/:id/stems/:stemId/download` | Streaming dell'audio di uno stem. |
| `DELETE` | `/api/collab/:id/stems/:stemId` | Autore dello stem o proprietario del progetto. |

Tutte le rotte richiedono il login (`authMiddleware.requireUser`).

## Webapp

- `/collab` — elenca i progetti condivisi, crea nuovi progetti (se rispetta `canPublishContent`).
- `/collab/:id` — stem (caricamento/riproduzione/eliminazione), cronologia versioni, form per il salvataggio dello snapshot.

## Non (ancora) in tempo reale

Nessun cursore/presenza dal vivo — la gestione delle versioni (righe append-only) copre le esigenze di collaborazione. La presenza in tempo reale è rinviata alle attività "Fase C" ZEN-via-`worker_thread`-RPC già pianificate (presenza effimera / playlist collaborative in tempo reale) documentate nelle regole di sessione del repository — Collab non la duplica né ne dipende.
