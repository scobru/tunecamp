# Inventario Componenti UI

Questo documento elenca i componenti principali dell'interfaccia utente di TuneCamp, organizzati per categoria e responsabilità.

## Componenti Globali e Layout (`layout/`)

- **`AppLayout.tsx`**: Struttura principale dell'applicazione (Sidebar, Player, Content area).
- **`Sidebar.tsx`**: Navigazione principale tra le diverse sezioni (Home, Libreria, Social).
- **`Header.tsx`**: Barra superiore con ricerca e profilo utente.

## Player Musicale (`player/`)

- **`Player.tsx`**: Il controller principale della riproduzione.
- **`ProgressBar.tsx`**: Visualizzazione del progresso e seeking.
- **`VolumeControl.tsx`**: Gestione del volume.
- **`QueueManager.tsx`**: Visualizzazione e gestione della coda di riproduzione.
- **`Waveform.tsx`**: Visualizzazione della forma d'onda della traccia corrente.

## Visualizzazione Contenuti (`artist/`, `albums/`)

- **`AlbumCard.tsx`**: Rappresentazione visuale di un album/release.
- **`TrackList.tsx`**: Elenco delle tracce all'interno di un album o playlist.
- **`ArtistProfile.tsx`**: Intestazione e informazioni sull'artista.

## Amministrazione e Gestione (`admin/`)

- **`UserList.tsx`**: Gestione degli utenti registrati sul server.
- **`ScannerProgress.tsx`**: Monitoraggio dello stato della scansione della libreria.
- **`SettingsForm.tsx`**: Configurazione dei parametri del server.

## Componenti Social (`social/`, `Comments.tsx`)

- **`Feed.tsx`**: Visualizzazione dei post dal Fediverso.
- **`CommentSection.tsx`**: Sistema di commenti per album e tracce.
- **`FollowButton.tsx`**: Gestione delle relazioni tra attori ActivityPub.

## Componenti UI Base (`ui/`)

- **`Button.tsx`**: Pulsante standard con varianti (primary, secondary, danger).
- **`Input.tsx`**: Campo di testo personalizzato.
- **`Modal.tsx`**: Wrapper per finestre di dialogo.
- **`WalletPill.tsx`**: Indicatore dello stato del wallet blockchain.
- **`ScrollingText.tsx`**: Testo a scorrimento per titoli lunghi.

## Note sullo Sviluppo

I componenti sono scritti in **TypeScript** utilizzando **Functional Components** e **Hooks**. Per lo styling viene utilizzato CSS standard con variabili per il supporto al tema scuro/chiaro.
