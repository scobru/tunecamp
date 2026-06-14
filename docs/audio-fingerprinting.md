# Audio Fingerprinting (dedup interno)

TuneCamp calcola un'**impronta audio** (fingerprint) leggera per ogni traccia, usata
come segnale interno per la **deduplicazione** della libreria.

> **Nota storica:** versioni precedenti pubblicavano le impronte su un "Community
> Registry" decentralizzato (namespace Zen `tunecamp-fingerprints`) con strumenti di
> manutenzione "Identify All", "Community Match" e "Share with Community" per l'auto-tagging
> tramite la rete. **Quel sistema è stato rimosso.** Zen è ora usato solo per la discovery
> delle istanze (vedi [FEDERATION.md](FEDERATION.md)) e il fingerprint resta un dato locale.

## Cos'è e a cosa serve

L'impronta trasforma il contenuto audio in una firma compatta basata sull'inviluppo
della forma d'onda, normalizzato per resistere a piccole variazioni di volume. Permette
di riconoscere che due file rappresentano (probabilmente) la stessa registrazione anche
con nomi o tag diversi.

L'unico uso attuale è la **deduplicazione**: quando più candidati corrispondono alla
stessa traccia, lo scanner preferisce la versione con i metadati migliori (album, durata,
fingerprint, external_id, testi, lossless). Il fingerprint è uno dei fattori di punteggio.

## Funzionamento

1. **Generazione**: durante la scansione, la pipeline waveform (`WaveformService`,
   `src/server/modules/waveform/waveform.generator.ts`) calcola un hash dell'inviluppo
   della forma d'onda.
2. **Persistenza**: il valore viene salvato nella colonna `fingerprint` della tabella
   `tracks` (vedi [data-models.md](data-models.md)). La colonna viene aggiunta
   automaticamente dalle migrazioni in `src/server/core/database.ts` se mancante.
3. **Dedup**: lo scanner (`src/server/modules/catalog/scanner.ts`) usa il fingerprint,
   insieme ad altri campi, per scegliere quale candidato tenere. La normalizzazione di
   avvio è in `maintenance.startup.ts`.

## Evoluzioni Future

Il campo è progettato per ospitare in futuro fingerprint acustici più robusti (es.
Chromaprint/`fpcalc`) qualora l'ambiente di hosting lo consenta, per un dedup più preciso
anche in presenza di ricompressione audio.
