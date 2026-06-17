# Audio Fingerprinting (Internal Deduplication)

TuneCamp calculates a lightweight **audio fingerprint** for each track, used as an internal signal for **library deduplication**.

> **Historical Note:** Earlier versions published fingerprints to a decentralized "Community Registry" (Zen namespace `tunecamp-fingerprints`) with maintenance tools like "Identify All", "Community Match", and "Share with Community" for auto-tagging across the network. **That system has been removed.** The fingerprint remains local.

## What it is and what it is used for

The fingerprint transforms the audio content into a compact signature based on the envelope of the waveform, normalized to withstand minor volume variations. It allows identifying that two files likely represent the same recording even with different names or tags.

The only current use is **deduplication**: when multiple candidates match the same track, the scanner prefers the version with the best metadata (album, duration, fingerprint, external_id, lyrics, lossless). The fingerprint is one of the scoring factors.

## How it works

1. **Generation**: During scanning, the waveform pipeline (`WaveformService`, `src/server/modules/waveform/waveform.generator.ts`) calculates a hash of the waveform envelope.
2. **Persistence**: The value is saved in the `fingerprint` column of the `tracks` table (see [data-models.md](data-models.md)). The column is automatically added by migrations in `src/server/core/database.ts` if missing.
3. **Deduplication**: The scanner (`src/server/modules/catalog/scanner.ts`) uses the fingerprint, along with other fields, to choose which candidate to keep. The startup normalization is in `maintenance.startup.ts`.

## Future Evolutions

The field is designed to host more robust acoustic fingerprints in the future (e.g., Chromaprint/`fpcalc`) if the hosting environment permits, for more precise deduplication even in the presence of audio re-compression.
