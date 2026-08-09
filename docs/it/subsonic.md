# Riferimento API Subsonic

TuneCamp espone un'API **Subsonic completa** all'indirizzo `/rest`, compatibile con la versione dell'API Subsonic **1.16.1**. Ciò la rende compatibile con tutti i principali client Subsonic.

## Client Testati

| Client | Piattaforma | Stato |
| :--- | :--- | :--- |
| DSub | Android | ✅ |
| Symfonium | Android | ✅ |
| Tempo | iOS | ✅ |
| Substreamer | Multi | ✅ |
| Amuse | Android | ✅ |
| play:Sub | iOS | ✅ |

## Impostazioni di Connessione

- **URL del Server**: `https://tuo-server.com/rest`
- **Nome Utente**: Il tuo nome utente di TuneCamp (amministratore o artista)
- **Password**: La tua **password Subsonic** — non la password del tuo account

Genera la password Subsonic da **Profilo → Impostazioni → Subsonic Password**. Viene mostrata una sola volta, al momento della creazione; se la perdi, generane una nuova. Rimuoverla disconnette tutti i client Subsonic che la usano e non tocca il resto dell'account.

> [!NOTE]
> Il protocollo Subsonic autentica come `md5(password + salt)`, quindi il server deve poter rileggere il segreto in chiaro — non può conservarne un hash a senso unico. Per questo Subsonic ha una propria password casuale invece di quella dell'account: una fuga del database espone solo credenziali revocabili e limitate allo streaming.

> [!NOTE]
> **Utenti in Roaming (Roaming Users)**: Per utilizzare Subsonic su una nuova istanza, effettua prima l'accesso a quell'istanza tramite l'interfaccia web. Questo avvia il processo di **Creazione Pigra dell'Account** (roaming), che configura il tuo profilo locale; poi genera lì una password Subsonic.

## Endpoint Supportati

TuneCamp implementa le specifiche principali del protocollo Subsonic (v1.16.1) richieste dai client mobili:

### Sistema & Connettività

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `ping.view` | Verifica la connettività al server e autentica | ✅ Supportato |
| `getLicense.view` | Restituisce licenza valida del server | ✅ Supportato |
| `getScanStatus.view` | Stato della scansione della libreria | ✅ Supportato |

### Esplorazione & Catalogo

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `getMusicFolders.view` | Elenca le cartelle radice della musica | ✅ Supportato |
| `getIndexes.view` | Elenco alfabetico degli artisti indicizzati | ✅ Supportato |
| `getArtists.view` | Elenca tutti gli artisti (indicizzazione ID3) | ✅ Supportato |
| `getMusicDirectory.view` | Esplora la directory (artista → album → tracce) | ✅ Supportato |
| `getArtist.view` | Dettagli artista e discografia | ✅ Supportato |
| `getAlbum.view` | Dettagli album con lista tracce | ✅ Supportato |
| `getArtistInfo.view` / `getArtistInfo2.view` | Biografia e immagini dell'artista | ✅ Supportato |
| `getAlbumInfo.view` / `getAlbumInfo2.view` | Descrizione dell'album e copertina | ✅ Supportato |
| `getGenres.view` | Elenco di tutti i generi musicali | ✅ Supportato |

### Liste Album / Brani & Ricerca

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `getAlbumList.view` / `getAlbumList2.view` | Liste album (`newest`, `random`, `frequent`, `recent`, `starred`, `alphabeticalByName`, `byGenre`, `byYear`) | ✅ Supportato |
| `getRandomSongs.view` | Selezione casuale di brani dalla libreria | ✅ Supportato |
| `getStarred.view` / `getStarred2.view` | Elementi preferiti/stellati | ✅ Supportato |
| `search.view` / `search2.view` / `search3.view` | Ricerca full-text su artisti, album e tracce | ✅ Supportato |

### Streaming Multimediale & Riproduzione

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `stream.view` | Streaming di file audio (supporta bitrate transcodifica e conversione formati) | ✅ Supportato |
| `getCoverArt.view` | Fornisce copertine e artwork per artisti, album e tracce | ✅ Supportato |
| `scrobble.view` | Registra riproduzioni nel DB e su scrobbler esterni | ✅ Supportato |
| `getNowPlaying.view` | Elenco dei brani in riproduzione attiva nelle sessioni | ✅ Supportato |

### Playlist & Podcast

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `getPlaylists.view` | Elenca tutte le playlist accessibili | ✅ Supportato |
| `getPlaylist.view` | Dettagli playlist con lista brani | ✅ Supportato |
| `createPlaylist.view` | Crea una nuova playlist utente | ✅ Supportato |
| `updatePlaylist.view` | Aggiungi/rimuovi brani, aggiorna visibilità | ✅ Supportato |
| `deletePlaylist.view` | Elimina una playlist | ✅ Supportato |
| `getPodcasts.view` | Elenca canali podcast / episodi | ✅ Supportato |
| `getNewestPodcasts.view` | Elenca gli episodi podcast più recenti | ✅ Supportato |

### Profilo Utente

| Endpoint | Descrizione | Stato |
| :--- | :--- | :--- |
| `getUser.view` | Dettagli utente e permessi di streaming | ✅ Supportato |

---

## Endpoint Non Implementati / Pianificati

I seguenti endpoint Subsonic non sono attualmente necessari per la riproduzione su DSub/Symfonium/Tempo e restituiscono un codice di endpoint non supportato:

- `download.view` (gestito tramite `stream.view` o le API REST native di TuneCamp)
- `getSong.view`, `getTopSongs.view`, `getSimilarSongs.view`
- `getLyrics.view`, `getAvatar.view`
- `star.view`, `unstar.view` (preferiti gestiti dall'interfaccia Web)
- `getPlayQueue.view`, `savePlayQueue.view`, `getBookmarks.view`
- `getInternetRadioStations.view`, `getShares.view`, `jukeboxControl.view`
