# Aggiungere Musica

Questo è il riferimento per far entrare l'audio in un'istanza TuneCamp: dove
vive la libreria su disco, cosa ne fa lo scanner e come una cartella scansionata
diventa una release pubblica. Ogni passaggio nell'interfaccia indica l'URL a cui
si trova, così puoi incollarlo dopo il tuo dominio
(`https://musica.esempio.com/admin`).

## 1. Dove vive la libreria

TuneCamp legge una sola cartella: **`TUNECAMP_MUSIC_DIR`**. Tutto ciò che
importa, carica o genera finisce lì sotto.

Due variabili d'ambiente indicano una cartella musicale, e la differenza confonde
spesso. Non sono sinonimi e nessuna delle due è deprecata:

| Variabile | Chi la legge | Cosa significa | Quando impostarla |
| :-------- | :----------- | :------------- | :---------------- |
| `TUNECAMP_MUSIC_PATH` | Docker Compose | La cartella **sull'host** da montare nel container | Usi `docker compose`. Default `./music` |
| `TUNECAMP_MUSIC_DIR` | Il server | Il percorso che il server legge davvero | Esegui dai sorgenti (`npm start`). Default `./music` |

Con Docker imposti `TUNECAMP_MUSIC_PATH` e ti fermi lì: `docker-compose.yml`
monta quella cartella dell'host su `/music` e fissa già
`TUNECAMP_MUSIC_DIR=/music` per te. Impostare `TUNECAMP_MUSIC_DIR` a mano in un
deploy Compose punta il server a un percorso interno al container su cui non è
montato niente.

```bash
# .env — Docker
TUNECAMP_MUSIC_PATH=/srv/music

# .env — esecuzione dai sorgenti
TUNECAMP_MUSIC_DIR=/srv/music
```

La cartella host predefinita è `./music` dentro il clone. È in `.gitignore`, così
la tua libreria non compare mai in `git status`.

## 2. Carica la musica prima del primo avvio

Non devi aspettare che l'app sia in piedi. Metti i file al loro posto prima e la
primissima scansione li prende tutti:

```bash
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

mkdir -p music
cp -r ~/Album/* music/           # oppure: TUNECAMP_MUSIC_PATH=/srv/music in .env

docker compose up -d --build
```

**Una cartella per album.** Lo scanner raggruppa le tracce per cartella che le
contiene, dà all'album il nome della cartella e ci cerca dentro la copertina
(`cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `artwork.jpg`,
`artwork.png` oppure `artwork/cover.jpg`). L'annidamento è libero — organizza per
artista, per anno, come preferisci:

```
music/
└── Boards of Canada/
    └── Music Has the Right to Children/
        ├── cover.jpg
        ├── 01 Wildlife Analysis.flac
        └── 02 An Eagle in Your Mind.flac
```

Titolo, artista, album artist, numero di traccia, anno e genere di ogni brano
arrivano dai tag del file (ID3, Vorbis comment, atom MP4). Anche i file senza tag
vengono importati — arrivano semplicemente con il nome del file come titolo.

## 3. Lancia la scansione

La scansione **non** è automatica all'avvio. Si lancia da
**`/admin` → scheda Maintenance → `Rescan Library`**.

Quel pulsante percorre tutta la cartella della libreria, legge i tag, genera le
waveform, estrae le copertine e salta i file già importati: puoi ripremerlo dopo
ogni modifica su disco senza rischi. L'avanzamento compare nell'elenco dei task
nello stesso pannello.

Per farla girare da sola, imposta **`/admin` → Settings → Scheduled Library
Scan** su un orario di scarso traffico. Di default è `Disabled`.

Altre due strade d'ingresso, entrambe con scansione del file all'arrivo:

- **Caricamento dall'interfaccia web** — vedi *Caricare dall'interfaccia web* qui
  sotto.
- **[Bot Telegram](./telegram.md)**, **[Google Drive](./google-drive.md)** o
  l'app desktop **[Sidecamp](./sidecamp.md)** (Soulseek, torrent, yt-dlp).

## 4. Da bozza a pubblico: cosa crea davvero una scansione

Una cartella scansionata diventa un **album di libreria**: `status: draft`,
`visibility: private`. È nella tua libreria, ascoltabile da te e invisibile al
pubblico. Niente di ciò che scansioni viene esposto finché non lo decidi tu — non
esiste una pagina "Draft mode" da cercare: la bozza è lo stato in cui i tuoi
album già si trovano.

La promozione avviene in due passaggi, su due schermate diverse:

1. **`/my-music`** elenca i tuoi album di libreria. `Promote` su uno lo trasforma
   in una *release formale* — quella che può essere prezzata, venduta, federata e
   scaricata. Resta comunque una bozza.
2. **`/admin` → scheda Releases** elenca le release formali. Aprine una per
   compilare i metadati (copertina, anno, licenza, prezzo, link), poi `Publish`
   per renderla pubblica.

Un album di libreria che non promuovi mai resta un album privato — va benissimo
se usi TuneCamp come server di streaming personale invece che come negozio.

## 5. Caricare dall'interfaccia web

**`/admin/release/new`** crea una release e ne carica l'audio in un colpo solo.
Trascina dentro i file audio e TuneCamp ne legge subito i tag, compilando titolo
della release, album artist, anno e genere più titolo e numero di ogni traccia:
un album ben taggato richiede quasi zero digitazione. Tutto ciò che viene
indovinato resta modificabile prima del salvataggio, e i campi che hai già
compilato non vengono mai sovrascritti.

Dove finisce l'audio caricato:

| Caricato... | Salvato in |
| :---------- | :--------- |
| dentro una release | `<music>/releases/<slug-della-release>/` |
| senza release collegata | `<music>/tracks/` |

`tracks/` è l'area di sosta per l'audio sciolto — un singolo, un demo, qualsiasi
cosa non ancora parte di una release. Promuoverlo o collegarlo in seguito non
sposta il file: il collegamento resta nel database.

## 6. Le cartelle create da TuneCamp

Accanto a quello che ci metti tu, l'app scrive queste cartelle sotto la cartella
musicale. Lasciate stare sono sicure; le elenchiamo perché nulla lì dentro
sembri misterioso.

| Cartella | Contiene |
| :------- | :------- |
| `releases/<slug>/` | Audio di una release formale, con il suo `artwork/` e `release.yaml` |
| `tracks/` | Audio caricato e non collegato a una release |
| `artists/<slug>/` | Foto e banner degli artisti |
| `samples/` | Sample pack e relative copertine |
| `collab/<id>/` | File allegati a un progetto di collaborazione |
| `playlists/covers/` | Copertine delle playlist |
| `assets/` | Branding del sito e immagini varie caricate |

### `releases/` e `tracks/`: la differenza

Sono le due che creano più confusione, perché contengono lo stesso tipo di file
— l'audio. La differenza non è cosa c'è dentro, è se quell'audio appartiene a
qualcosa:

- **`releases/<slug>/`** contiene i file di una release, tenuti insieme sotto lo
  slug di quella release.
- **`tracks/`** è dove finisce un caricamento che non era collegato ad alcuna
  release.

Quindi `tracks/` va letto come *il mucchio non archiviato*, non come "tutte le
tracce": una traccia che appartiene a una release lì dentro non c'è, sta sotto
`releases/`. In quale delle due finisce un file si decide una volta sola, quando
arriva: promuovere un album a release formale ne cambia lo stato nel database e
non sposta nulla su disco.

Se stai mettendo i file a mano e vuoi che siano trattati come una release,
mettili tu in `releases/<slug>/` invece che in `tracks/`.

## 7. Modificare la libreria su disco

I file restano file normali: rinominali, ritagga o riorganizzali con gli
strumenti che preferisci. TuneCamp non li blocca.

Due regole tengono allineato il database:

- **Dopo aver modificato su disco, lancia una nuova scansione** (`/admin` →
  Maintenance → `Rescan Library`). Spostamenti e nuovi tag vengono raccolti lì;
  fino ad allora il database descrive ancora lo stato precedente.
- **Non modificare a mano `releases/<slug>/` mentre quella release è
  pubblicata.** Il `release.yaml` e le righe del database sono scritti dall'app;
  una scansione riconcilia audio aggiunto e rimosso, ma i metadati che cambi su
  disco perdono contro quelli dell'editor delle release.

Per modifiche rapide senza una sessione SSH, **`/browser`** è un file browser di
amministrazione integrato sulla cartella musicale: naviga, rinomina, sposta,
elimina e ascolta l'audio in anteprima.

## Vedi anche

- [Avvio Rapido](./getting-started.md) — installazione e primo accesso
- [Ruoli e Permessi](./ROLES.md) — chi può caricare e pubblicare
- [Backup e Migrazione](./backup-migration.md) — spostare libreria e database
- [Telegram](./telegram.md) · [Google Drive](./google-drive.md) ·
  [Sidecamp](./sidecamp.md) — altri percorsi di ingestione
