# Impronte Digitali Audio (Deduplicazione Interna)

TuneCamp calcola un'**impronta digitale audio (audio fingerprint)** leggera per ciascuna traccia, utilizzata come parametro interno per la **deduplicazione della libreria**.

> **Nota Storica**: le versioni precedenti pubblicavano le impronte digitali in un registro comunitario decentralizzato ("Community Registry" nello spazio dei nomi Zen `tunecamp-fingerprints`) offrendo strumenti di manutenzione quali "Identify All", "Community Match" e "Share with Community" per l'auto-tagging dei brani in rete. **Quel sistema è stato rimosso.** L'impronta digitale rimane ora esclusivamente locale.

## Cos'è e a cosa serve

L'impronta digitale trasforma il contenuto audio in una firma compatta basata sull'inviluppo della forma d'onda, normalizzata per resistere a lievi variazioni di volume. Consente di identificare che due file rappresentano probabilmente la stessa registrazione, anche se presentano nomi o tag differenti.

L'unico utilizzo attuale è la **deduplicazione**: quando diversi file candidati corrispondono alla stessa traccia, lo scansionatore (scanner) preferisce la versione con i metadati migliori (presenza dell'album, durata, impronta digitale, external_id, testi, formato lossless). L'impronta digitale è uno dei fattori che compongono il punteggio di valutazione.

## Come funziona

1. **Generazione**: Durante la scansione, la pipeline della forma d'onda (`WaveformService`, in `src/server/modules/waveform/waveform.generator.ts`) calcola un hash dell'inviluppo della forma d'onda.
2. **Persistenza**: Il valore viene salvato nella colonna `fingerprint` della tabella `tracks` (vedi [data-models.md](./data-models.md)). La colonna viene aggiunta automaticamente dalle migrazioni in `src/server/core/database.ts` se non presente.
3. **Deduplicazione**: Lo scansionatore (`src/server/modules/catalog/scanner.ts`) utilizza l'impronta digitale, insieme ad altri campi, per scegliere quale candidato conservare. La normalizzazione all'avvio è gestita in `maintenance.startup.ts`.

## Evoluzioni Future

Il campo è predisposto per accogliere in futuro impronte acustiche più robuste (es. Chromaprint/`fpcalc`) qualora l'ambiente di hosting lo consenta, per una deduplicazione più precisa anche in presenza di ricompressioni del file audio.
