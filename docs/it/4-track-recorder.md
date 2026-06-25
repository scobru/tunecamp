# TuneCamp 4-Track Recorder (Registratore a 4 Tracce)

Un registratore a cassette a 4 tracce basato su browser realizzato con le API Web Audio e Svelte 5. Gestito e mantenuto come pacchetto autonomo presso il repository [`tunecamp-4-track-recorder`](https://github.com/scobru/tunecamp-4-track-recorder).

Tutta l'elaborazione viene eseguita interamente lato client — nessun server richiesto.

## Caratteristiche

- Registrazione in sovrapposizione (overdub) a bassa latenza con compensazione della latenza
- Riproduzione multitraccia accurata al campione
- Salvataggio/caricamento dei progetti nel formato binario `.4trk` (dati audio + impostazioni del mixer)
- Controlli del mixer: volume e pan per singola traccia, volume master

## Installazione

```bash
npm install 4-track-recorder
```

## Utilizzo di Base

```svelte
<script>
  import { FourTrack } from "4-track-recorder"
</script>

<FourTrack />
```

## Salvare e Caricare i Progetti

```svelte
<script>
  import { FourTrack } from "4-track-recorder"

  let save
  let load

  function handleSave() {
    const blob = save()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "la-mia-canzone.4trk"
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<FourTrack bind:save bind:load />
<button onclick={handleSave}>Salva Progetto</button>
```

## Proprietà (Props)

| Proprietà | Tipo | Descrizione |
|---|---|---|
| `hiddenTracks` | `HiddenTrackConfig[]` | Tracce audio in background (ad esempio il fruscio della cassetta) |
| `onready` | `(detail: { engine }) => void` | Callback attivata all'inizializzazione del motore audio |
| `save` | `() => Blob` (collegabile/bindable) | Esporta il progetto come file `.4trk` (Blob) |
| `load` | `(source: File \| string) => Promise<void>` (collegabile/bindable) | Importa un file o un URL `.4trk` |
| `initialProject` | `string \| File` | URL o File da caricare automaticamente all'avvio |

## Repository

[github.com/scobru/tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder)
