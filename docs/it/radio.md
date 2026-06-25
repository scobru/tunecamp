# Radio

TuneCamp può trasmettere una singola **stazione radio sempre attiva** attingendo dalla tua libreria personale. Transcodifica una coda di brani in uno streaming HLS a ciclo continuo a cui chiunque può sintonizzarsi — nel browser all'indirizzo `/radio` o in qualsiasi lettore esterno tramite un feed RSS stile podcast o una playlist M3U.

È presente una sola stazione per ogni istanza. Solo gli amministratori possono avviarla e arrestarla; l'ascolto è pubblico.

## Come funziona

Quando avvii la stazione, TuneCamp risolve le sorgenti selezionate in una coda di tracce, scrive una playlist `concat` per FFmpeg e avvia un processo FFmpeg per produrre uno stream HLS ciclico (`-stream_loop -1`, in modo che la coda si ripeta all'infinito). Gli ascoltatori scaricano la playlist HLS; la stazione sopravvive al riavvio del server e riprende automaticamente (vedi la guida al [Monitoraggio](./monitoring.md) per lo stato di salute dei processi).

> **Solo file locali.** La radio può trasmettere solo tracce che dispongono di un file audio reale memorizzato sul server. Le tracce su cloud (`gdrive://`), esterne e di rete non hanno un file locale e vengono saltate silenziosamente. Se *nessuna* delle tue scelte dispone di un file locale, l'avvio della stazione fallirà con un errore chiaro.

## Creare una stazione (Admin → Radio)

1. Apri **Admin Panel → Radio**.
2. Assegna un **nome** alla stazione.
3. Scegli il suo contenuto. Puoi combinare, tramite caselle di controllo, qualsiasi quantità di:
   - **Le tue playlist** — le playlist personalizzate create nell'istanza.
   - **Mix di genere** — un mix dinamico per ogni genere presente nella tua libreria (es. *Rock Mix*, *Jazz Mix*). Questi mix sono calcolati in tempo reale a partire da ogni traccia contrassegnata con quel genere — non devi gestirli manualmente.
   I brani di tutte le sorgenti selezionate vengono **uniti in un'unica coda, rimuovendo i duplicati** (una traccia presente in due selezioni viene riprodotta una volta sola).
4. Abilita facoltativamente l'opzione **Shuffle queue** (Riproduzione casuale).
5. Fai clic su **Start Radio**.

La selezione viene salvata in modo persistente; al riavvio del server la stazione riprende e **risolve nuovamente ogni sorgente da zero** — le tracce aggiunte di recente in una playlist o genere selezionato vengono rilevate automaticamente al riavvio successivo.

Per modificare la programmazione, premi **Stop** per arrestare la stazione e avviala di nuovo con una nuova selezione.

## Ascolto

| Dove | URL |
|---|---|
| Lettore nel browser | `/radio` |
| Stream HLS (VLC, mpv, lettori web) | `/api/radio/hls/stream.m3u8` |
| Playlist M3U (VLC, foobar2000) | `/api/radio/stream.m3u` |
| Feed Podcast/RSS (Pocket Casts, AntennaPod) | `/api/radio/feed.rss` |

La pagina `/radio` mostra anche la traccia corrente e il numero di ascoltatori in tempo reale.

## API

Vedi [Contratti API → Radio](./api-contracts.md#radio-apiradio) per l'elenco completo degli endpoint. L'endpoint di amministrazione accetta un array `sources` contenente sia ID numerici delle playlist che ID di tipo `genre:<nome>`:

```jsonc
POST /api/radio/start
{
  "name": "Late Night Mix",
  "sources": ["12", "genre:ambient", "genre:jazz"],  // playlist n. 12 + due mix di genere
  "shuffle": true
}
```

Gli ID `playlistId` (singoli) e un array esplicito di `trackIds` sono ancora accettati per compatibilità con le versioni precedenti; quando `sources` è presente, assume la priorità.
