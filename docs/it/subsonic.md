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
- **Password**: La password del tuo account

> [!NOTE]
> **Utenti in Roaming (Roaming Users)**: Per utilizzare Subsonic su una nuova istanza, devi prima effettuare l'accesso a quell'istanza tramite l'interfaccia web almeno una volta. Questo avvia il processo di **Creazione Pigra dell'Account** (roaming), che configura il tuo profilo locale e le credenziali richieste per l'autenticazione Subsonic.

## Endpoint Supportati

### Sistema

| Endpoint | Descrizione |
| :--- | :--- |
| `ping.view` | Verifica la connettività del server |
| `getLicense.view` | Restituisce una licenza valida |
| `getOpenSubsonicExtensions.view` | Elenco delle estensioni OpenSubsonic |

### Navigazione

| Endpoint | Descrizione |
| :--- | :--- |
| `getMusicFolders.view` | Elenca le cartelle musicali |
| `getIndexes.view` | Elenca gli artisti indicizzati alfabeticamente |
| `getMusicDirectory.view` | Naviga la directory (artista → album → tracce) |
| `getArtists.view` | Elenca tutti gli artisti (ID3) |
| `getArtist.view` | Dettagli dell'artista con relativi album |
| `getAlbum.view` | Dettagli dell'album con relative tracce |
| `getSong.view` | Dettagli di una singola traccia |
| `getGenres.view` | Elenca tutti i generi |
| `getArtistInfo.view` / `getArtistInfo2.view` | Biografia e immagini dell'artista |
| `getAlbumInfo.view` / `getAlbumInfo2.view` | Note e immagini dell'album |
| `getSimilarSongs.view` / `getSimilarSongs2.view` | Scopri canzoni simili |
| `getTopSongs.view` | Brani principali/popolari |

### Elenchi Album/Brani

| Endpoint | Descrizione |
| :--- | :--- |
| `getAlbumList.view` / `getAlbumList2.view` | Elenchi di album (casuali, più recenti, alfabetici, frequenti, recenti, preferiti, per genere, per anno) |
| `getRandomSongs.view` | Selezione casuale delle tracce |
| `getSongsByGenre.view` | Filtra i brani per genere |
| `getStarred.view` / `getStarred2.view` | Ottieni elementi contrassegnati come preferiti (stellati) |

### Media

| Endpoint | Descrizione |
| :--- | :--- |
| `stream.view` | Esegui lo streaming di file audio |
| `download.view` | Scarica i file audio |
| `getCoverArt.view` | Ottieni le immagini di copertina |
| `getLyrics.view` | Ottieni i testi dei brani |

### Ricerca

| Endpoint | Descrizione |
| :--- | :--- |
| `search.view` / `search2.view` / `search3.view` | Ricerca full-text tra artisti, album e tracce |

### Playlist

| Endpoint | Descrizione |
| :--- | :--- |
| `getPlaylists.view` | Elenca tutte le playlist |
| `getPlaylist.view` | Ottieni playlist con relative tracce |
| `createPlaylist.view` | Crea o aggiorna una playlist |
| `updatePlaylist.view` | Aggiungi/rimuovi canzoni, rinomina |
| `deletePlaylist.view` | Elimina una playlist |

### Preferiti (Stelle)

| Endpoint | Descrizione |
| :--- | :--- |
| `star.view` | Aggiungi ai preferiti artisti, album, canzoni |
| `unstar.view` | Rimuovi dai preferiti |

### Utente e Scrobbling

| Endpoint | Descrizione |
| :--- | :--- |
| `getUser.view` | Ottieni dettagli e permessi dell'utente |
| `getUsers.view` | Elenca tutti gli utenti |
| `scrobble.view` | Registra le riproduzioni dei brani (SQLite locale) |
| `getNowPlaying.view` | Brani attualmente in riproduzione |

### Coda di Riproduzione e Segnalibri

| Endpoint | Descrizione |
| :--- | :--- |
| `getPlayQueue.view` | Ottieni la coda di riproduzione salvata |
| `savePlayQueue.view` | Salva lo stato della coda di riproduzione |
| `getBookmarks.view` | Ottieni i segnalibri |
| `createBookmark.view` | Crea un segnalibro |
| `deleteBookmark.view` | Elimina un segnalibro |

### Sistema e Varie

| Endpoint | Descrizione |
| :--- | :--- |
| `getScanStatus.view` | Stato della scansione della libreria multimediale |
| `startScan.view` | Avvia la scansione della libreria |
| `getAvatar.view` | Ottieni l'avatar dell'utente |
| `getPodcasts.view` | Canali podcast (stub) |
| `getInternetRadioStations.view` | Stazioni radio internet (stub) |
| `getShares.view` | Elementi condivisi (stub) |
| `jukeboxControl.view` | Controllo jukebox (stub) |
