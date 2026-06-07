# Audio Fingerprinting & Community Registry

TuneCamp integra un sistema di **Audio Fingerprinting** (impronte digitali audio) per consentire l'identificazione automatica delle tracce, la deduplicazione e l'arricchimento dei metadati tramite una rete decentralizzata (ZenDB).

## Panoramica

L'Audio Fingerprinting trasforma un file audio in una firma digitale unica (hash) basata sulle sue caratteristiche percettive (inviluppo sonoro). Questo permette di riconoscere una canzone anche se il file ha nomi diversi o tag ID3 mancanti.

### Obiettivi
- **Auto-tagging**: Identificare automaticamente artista, album e genere.
- **Verifica Decentralizzata**: Utilizzare la community per validare i metadati.
- **Deduplicazione**: Riconoscere file identici caricati più volte.

## Funzionamento Tecnico

### 1. Generazione della Firma
La firma viene generata dal pipeline di `WaveformService` durante la scansione della traccia. Attualmente viene calcolato un hash dell'inviluppo della forma d'onda (waveform envelope), normalizzato per essere resistente a piccole variazioni di volume. Il valore risultante viene salvato nella colonna `fingerprint` della tabella `tracks` nel database.

### 2. Community Registry (ZenDB)
Le impronte digitali e i relativi metadati sono memorizzati nel namespace `tunecamp-fingerprints` della rete Zen. 
- Quando una traccia viene "condivisa", la sua firma e i metadati locali vengono pubblicati sulla rete mesh.
- Quando viene eseguito un "lookup", il sistema cerca sulla rete se esiste già una firma corrispondente.

### 3. Automazione

#### Identificazione Automatica
Il sistema esegue automaticamente il fingerprinting e il lookup nei seguenti casi:
- **Localizzazione**: Quando una traccia viene importata da Google Drive o da un URL esterno.
- **Importazione Manuale**: Durante il processo di scansione iniziale.

Se viene trovata una corrispondenza nella community, i campi vuoti (genere, anno, album) vengono compilati automaticamente.

## Manutenzione (Admin)

Gli amministratori hanno accesso a strumenti avanzati nel **Maintenance Panel**:

- **Identify All**: Scansiona l'intera libreria esistente, genera le firme mancanti e tenta di identificare le tracce tramite la community.
- **Community Match**: (Singola traccia) Forza la ricerca di metadati per una specifica traccia.
- **Share with Community**: Registra i metadati locali di una traccia nel registro globale ZenDB.

## Evoluzioni Future
Il sistema è progettato per supportare **Acoustic Fingerprinting** più robusti (come Chromaprint/fpcalc) qualora l'ambiente di hosting lo consenta, garantendo una precisione ancora maggiore anche in presenza di ricompressione audio.
